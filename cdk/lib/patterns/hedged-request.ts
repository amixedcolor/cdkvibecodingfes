import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { SuperpositionEngine } from '../constructs/superposition-engine';

export interface HedgedRequestConfig {
  /**
   * Primary execution function
   */
  readonly primaryFunction: lambda.Function;
  
  /**
   * Backup execution functions for hedged requests
   */
  readonly backupFunctions: lambda.Function[];
  
  /**
   * Latency threshold to trigger hedged requests (ms)
   */
  readonly hedgeThresholdMs: number;
  
  /**
   * Maximum number of concurrent hedged requests
   */
  readonly maxHedgedRequests?: number;
  
  /**
   * Enable speculative execution
   */
  readonly enableSpeculativeExecution?: boolean;
}

/**
 * Hedged Request Pattern - Implements Google's "Tail at Scale" hedged requests
 * to reduce tail latency by running duplicate requests
 */
export class HedgedRequestPattern extends Construct {
  public readonly superpositionEngine: SuperpositionEngine;
  public readonly orchestrator: lambda.Function;
  public readonly metricsTable: dynamodb.Table;
  
  constructor(scope: Construct, id: string, config: HedgedRequestConfig) {
    super(scope, id);
    
    // Metrics table for latency tracking
    this.metricsTable = new dynamodb.Table(this, 'HedgedMetricsTable', {
      tableName: `${id}-hedged-metrics`,
      partitionKey: { name: 'functionName', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // Orchestrator function for hedged request logic
    this.orchestrator = new lambda.Function(this, 'HedgedOrchestrator', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createOrchestratorCode(config)),
      timeout: cdk.Duration.seconds(60),
      environment: {
        PRIMARY_FUNCTION_NAME: config.primaryFunction.functionName,
        BACKUP_FUNCTION_NAMES: JSON.stringify(config.backupFunctions.map(f => f.functionName)),
        HEDGE_THRESHOLD_MS: config.hedgeThresholdMs.toString(),
        MAX_HEDGED_REQUESTS: (config.maxHedgedRequests ?? 2).toString(),
        METRICS_TABLE_NAME: this.metricsTable.tableName,
        ENABLE_SPECULATIVE: (config.enableSpeculativeExecution ?? false).toString()
      }
    });
    
    // Grant permissions
    config.primaryFunction.grantInvoke(this.orchestrator);
    config.backupFunctions.forEach(func => func.grantInvoke(this.orchestrator));
    this.metricsTable.grantReadWriteData(this.orchestrator);
    
    // Create superposition engine with all functions
    const allFunctions = [config.primaryFunction, ...config.backupFunctions];
    this.superpositionEngine = new SuperpositionEngine(this, 'HedgedSuperposition', {
      parallelFunctions: allFunctions,
      enableHedgedRequests: true,
      hedgedThresholdMs: config.hedgeThresholdMs,
      maxExecutionTime: cdk.Duration.minutes(2)
    });
  }
  
  private createOrchestratorCode(config: HedgedRequestConfig): string {
    return `
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const lambda = new LambdaClient({});
const dynamodb = new DynamoDBClient({});

const primaryFunctionName = process.env.PRIMARY_FUNCTION_NAME;
const backupFunctionNames = JSON.parse(process.env.BACKUP_FUNCTION_NAMES);
const hedgeThresholdMs = parseInt(process.env.HEDGE_THRESHOLD_MS);
const maxHedgedRequests = parseInt(process.env.MAX_HEDGED_REQUESTS);
const metricsTableName = process.env.METRICS_TABLE_NAME;
const enableSpeculative = process.env.ENABLE_SPECULATIVE === 'true';

exports.handler = async (event) => {
  const requestId = event.requestId || generateRequestId();
  const startTime = Date.now();
  
  try {
    // Determine execution strategy based on historical data
    const strategy = await determineExecutionStrategy(event);
    
    let result;
    switch (strategy.type) {
      case 'IMMEDIATE_HEDGE':
        result = await executeImmediateHedgedRequest(event, requestId);
        break;
      case 'DELAYED_HEDGE':
        result = await executeDelayedHedgedRequest(event, requestId);
        break;
      case 'SPECULATIVE':
        result = await executeSpeculativeRequest(event, requestId);
        break;
      default:
        result = await executePrimaryOnly(event, requestId);
    }
    
    // Record metrics
    await recordExecutionMetrics(requestId, startTime, result, strategy);
    
    return result;
    
  } catch (error) {
    console.error('Hedged Request Error:', error);
    throw error;
  }
};

async function determineExecutionStrategy(event) {
  // Get historical performance data
  const recentMetrics = await getRecentMetrics();
  
  const avgLatency = calculateAverageLatency(recentMetrics);
  const p95Latency = calculatePercentileLatency(recentMetrics, 95);
  const errorRate = calculateErrorRate(recentMetrics);
  
  // Decision logic based on recent performance
  if (errorRate > 0.05) { // 5% error rate
    return { type: 'IMMEDIATE_HEDGE', reason: 'High error rate detected' };
  }
  
  if (p95Latency > hedgeThresholdMs * 2) {
    return { type: 'IMMEDIATE_HEDGE', reason: 'High P95 latency' };
  }
  
  if (avgLatency > hedgeThresholdMs) {
    return { type: 'DELAYED_HEDGE', reason: 'Average latency above threshold' };
  }
  
  if (enableSpeculative && isHighValueRequest(event)) {
    return { type: 'SPECULATIVE', reason: 'High value request optimization' };
  }
  
  return { type: 'PRIMARY_ONLY', reason: 'Normal performance conditions' };
}

async function executeImmediateHedgedRequest(event, requestId) {
  console.log('Executing immediate hedged request');
  
  // Start primary and backup functions simultaneously
  const promises = [
    invokeFunctionWithTimeout(primaryFunctionName, event, hedgeThresholdMs * 2),
    ...backupFunctionNames.slice(0, maxHedgedRequests).map(name => 
      invokeFunctionWithTimeout(name, event, hedgeThresholdMs * 2)
    )
  ];
  
  // Race all promises and return the first successful result
  try {
    const result = await Promise.race(promises.map(async (promise, index) => {
      try {
        const response = await promise;
        return { response, winner: index === 0 ? 'primary' : \`backup-\${index-1}\` };
      } catch (error) {
        throw { error, source: index === 0 ? 'primary' : \`backup-\${index-1}\` };
      }
    }));
    
    return {
      ...result.response,
      hedgedRequestMetadata: {
        strategy: 'IMMEDIATE_HEDGE',
        winner: result.winner,
        requestId: requestId
      }
    };
  } catch (error) {
    throw new Error(\`All hedged requests failed: \${error.message}\`);
  }
}

async function executeDelayedHedgedRequest(event, requestId) {
  console.log('Executing delayed hedged request');
  
  // Start primary function
  const primaryPromise = invokeFunctionWithTimeout(primaryFunctionName, event, hedgeThresholdMs * 3);
  
  // Set up delayed hedge triggers
  const hedgePromises = [];
  let hedgeTimer;
  
  return new Promise((resolve, reject) => {
    // Primary function completion
    primaryPromise
      .then(result => {
        if (hedgeTimer) clearTimeout(hedgeTimer);
        resolve({
          ...result,
          hedgedRequestMetadata: {
            strategy: 'DELAYED_HEDGE',
            winner: 'primary',
            hedgesTriggered: hedgePromises.length,
            requestId: requestId
          }
        });
      })
      .catch(error => {
        console.warn('Primary function failed:', error);
      });
    
    // Delayed hedge trigger
    hedgeTimer = setTimeout(async () => {
      console.log('Triggering delayed hedge requests');
      
      for (let i = 0; i < Math.min(maxHedgedRequests, backupFunctionNames.length); i++) {
        const hedgePromise = invokeFunctionWithTimeout(
          backupFunctionNames[i], 
          event, 
          hedgeThresholdMs
        ).then(result => {
          resolve({
            ...result,
            hedgedRequestMetadata: {
              strategy: 'DELAYED_HEDGE',
              winner: \`backup-\${i}\`,
              hedgesTriggered: hedgePromises.length + 1,
              requestId: requestId
            }
          });
        }).catch(error => {
          console.warn(\`Backup function \${i} failed:\`, error);
        });
        
        hedgePromises.push(hedgePromise);
      }
      
      // If all fail
      Promise.all([primaryPromise, ...hedgePromises].map(p => p.catch(e => e)))
        .then(results => {
          const errors = results.filter(r => r instanceof Error);
          if (errors.length === results.length) {
            reject(new Error('All hedged requests failed'));
          }
        });
    }, hedgeThresholdMs);
  });
}

async function executeSpeculativeRequest(event, requestId) {
  console.log('Executing speculative request');
  
  // Pre-compute likely next requests
  const speculativePayloads = generateSpeculativePayloads(event);
  
  // Execute primary request
  const primaryResult = await invokeFunctionWithTimeout(primaryFunctionName, event, hedgeThresholdMs * 2);
  
  // Trigger speculative executions for next likely requests
  const speculativePromises = speculativePayloads.map(payload => 
    invokeFunctionWithTimeout(primaryFunctionName, payload, hedgeThresholdMs)
      .catch(error => ({ error, payload }))
  );
  
  return {
    ...primaryResult,
    hedgedRequestMetadata: {
      strategy: 'SPECULATIVE',
      speculativeExecutions: speculativePayloads.length,
      requestId: requestId
    }
  };
}

async function executePrimaryOnly(event, requestId) {
  const result = await invokeFunctionWithTimeout(primaryFunctionName, event, hedgeThresholdMs * 3);
  
  return {
    ...result,
    hedgedRequestMetadata: {
      strategy: 'PRIMARY_ONLY',
      requestId: requestId
    }
  };
}

async function invokeFunctionWithTimeout(functionName, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: 'RequestResponse'
    }), { abortSignal: controller.signal });
    
    clearTimeout(timeoutId);
    
    if (result.Payload) {
      return JSON.parse(new TextDecoder().decode(result.Payload));
    }
    
    throw new Error('No payload returned');
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function getRecentMetrics() {
  // Get metrics from the last hour
  const oneHourAgo = Date.now() - 3600000;
  
  const params = {
    TableName: metricsTableName,
    KeyConditionExpression: 'functionName = :fn AND #timestamp > :time',
    ExpressionAttributeNames: { '#timestamp': 'timestamp' },
    ExpressionAttributeValues: marshall({
      ':fn': primaryFunctionName,
      ':time': oneHourAgo
    }),
    ScanIndexForward: false,
    Limit: 100
  };
  
  try {
    const result = await dynamodb.send(new QueryCommand(params));
    return result.Items?.map(item => unmarshall(item)) || [];
  } catch (error) {
    console.warn('Failed to get recent metrics:', error);
    return [];
  }
}

function calculateAverageLatency(metrics) {
  if (metrics.length === 0) return 0;
  const sum = metrics.reduce((acc, metric) => acc + (metric.latency || 0), 0);
  return sum / metrics.length;
}

function calculatePercentileLatency(metrics, percentile) {
  if (metrics.length === 0) return 0;
  const sorted = metrics.map(m => m.latency || 0).sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateErrorRate(metrics) {
  if (metrics.length === 0) return 0;
  const errors = metrics.filter(m => m.success === false).length;
  return errors / metrics.length;
}

function isHighValueRequest(event) {
  // Implement business logic to identify high-value requests
  return event.priority === 'high' || event.userId?.startsWith('premium-');
}

function generateSpeculativePayloads(event) {
  // Generate likely next requests based on current request
  const payloads = [];
  
  if (event.action === 'getUser') {
    // Likely to request user's orders next
    payloads.push({ action: 'getUserOrders', userId: event.userId });
  }
  
  if (event.action === 'addToCart') {
    // Likely to view cart or checkout next
    payloads.push({ action: 'getCart', userId: event.userId });
    payloads.push({ action: 'getRelatedProducts', productId: event.productId });
  }
  
  return payloads;
}

async function recordExecutionMetrics(requestId, startTime, result, strategy) {
  const endTime = Date.now();
  const latency = endTime - startTime;
  
  const metricsItem = {
    functionName: primaryFunctionName,
    timestamp: endTime,
    requestId: requestId,
    latency: latency,
    success: result && !result.error,
    strategy: strategy.type,
    strategyReason: strategy.reason,
    ttl: Math.floor(endTime / 1000) + 86400 // 24 hours TTL
  };
  
  try {
    await dynamodb.send(new PutItemCommand({
      TableName: metricsTableName,
      Item: marshall(metricsItem)
    }));
  } catch (error) {
    console.warn('Failed to record metrics:', error);
  }
}

function generateRequestId() {
  return \`req-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;
}
`;
  }
}