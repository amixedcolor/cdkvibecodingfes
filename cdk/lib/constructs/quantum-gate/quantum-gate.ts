import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface QuantumGateProps {
  /**
   * The execution paths to distribute requests across
   */
  readonly executionPaths: {
    name: string;
    weight: number;
    handler: lambda.Function;
  }[];
  
  /**
   * Enable probabilistic routing based on Multi-Armed Bandit algorithm
   */
  readonly enableAdaptiveRouting?: boolean;
  
  /**
   * Minimum sample size before adaptive routing kicks in
   */
  readonly minSampleSize?: number;
}

/**
 * Quantum Gate - Probabilistic API Gateway that distributes requests
 * across multiple execution paths using quantum-inspired routing
 */
export class QuantumGate extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly routerFunction: lambda.Function;
  
  constructor(scope: Construct, id: string, props: QuantumGateProps) {
    super(scope, id);
    
    // Router Lambda that implements probabilistic routing
    this.routerFunction = new lambda.Function(this, 'RouterFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createRouterCode(props)),
      timeout: cdk.Duration.seconds(30),
      environment: {
        EXECUTION_PATHS: JSON.stringify(props.executionPaths.map(path => ({
          name: path.name,
          weight: path.weight,
          functionName: path.handler.functionName
        }))),
        ENABLE_ADAPTIVE_ROUTING: (props.enableAdaptiveRouting ?? true).toString(),
        MIN_SAMPLE_SIZE: (props.minSampleSize ?? 100).toString()
      },
      logGroup: new logs.LogGroup(this, 'RouterLogGroup', {
        logGroupName: `/aws/lambda/${id}-router`,
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    // Grant permissions to invoke execution path functions
    props.executionPaths.forEach(path => {
      path.handler.grantInvoke(this.routerFunction);
    });
    
    // API Gateway with Lambda proxy integration
    this.api = new apigateway.RestApi(this, 'QuantumGateApi', {
      restApiName: `${id}-quantum-gate`,
      description: 'Quantum-inspired probabilistic API Gateway',
      deployOptions: {
        stageName: 'quantum',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      }
    });
    
    // Proxy resource for all requests
    const proxyResource = this.api.root.addProxy({
      defaultIntegration: new apigateway.LambdaIntegration(this.routerFunction, {
        proxy: true,
        allowTestInvoke: false
      }),
      anyMethod: true
    });
  }
  
  private createRouterCode(props: QuantumGateProps): string {
    return `
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});
const executionPaths = JSON.parse(process.env.EXECUTION_PATHS);
const enableAdaptiveRouting = process.env.ENABLE_ADAPTIVE_ROUTING === 'true';
const minSampleSize = parseInt(process.env.MIN_SAMPLE_SIZE);

// Simple in-memory storage for path performance (in production, use DynamoDB)
let pathStats = {};

exports.handler = async (event) => {
  try {
    const selectedPath = await selectExecutionPath(event);
    const startTime = Date.now();
    
    const invokeParams = {
      FunctionName: selectedPath.functionName,
      Payload: JSON.stringify(event),
      InvocationType: 'RequestResponse'
    };
    
    const result = await lambda.send(new InvokeCommand(invokeParams));
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Update path statistics for adaptive routing
    updatePathStats(selectedPath.name, latency, true);
    
    // Parse and return the response
    const payload = JSON.parse(new TextDecoder().decode(result.Payload));
    
    return {
      statusCode: payload.statusCode || 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Quantum-Path': selectedPath.name,
        'X-Quantum-Latency': latency.toString()
      },
      body: payload.body || JSON.stringify(payload)
    };
    
  } catch (error) {
    console.error('Quantum Gate Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Quantum superposition collapsed unexpectedly'
      })
    };
  }
};

async function selectExecutionPath(event) {
  if (enableAdaptiveRouting && hasEnoughSamples()) {
    return thompsonSampling();
  } else {
    return weightedRandomSelection();
  }
}

function weightedRandomSelection() {
  const totalWeight = executionPaths.reduce((sum, path) => sum + path.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const path of executionPaths) {
    random -= path.weight;
    if (random <= 0) {
      return path;
    }
  }
  
  return executionPaths[0]; // fallback
}

function thompsonSampling() {
  // Simple Thompson Sampling implementation
  let bestPath = null;
  let bestSample = -Infinity;
  
  for (const path of executionPaths) {
    const stats = pathStats[path.name] || { successCount: 1, totalCount: 2, avgLatency: 1000 };
    
    // Beta distribution sampling (simplified)
    const alpha = stats.successCount + 1;
    const beta = stats.totalCount - stats.successCount + 1;
    const sample = betaSample(alpha, beta) / (stats.avgLatency / 1000); // reward low latency
    
    if (sample > bestSample) {
      bestSample = sample;
      bestPath = path;
    }
  }
  
  return bestPath || executionPaths[0];
}

function betaSample(alpha, beta) {
  // Simplified beta distribution sampling
  const x = Math.random();
  const y = Math.random();
  return Math.pow(x, 1/alpha) / (Math.pow(x, 1/alpha) + Math.pow(y, 1/beta));
}

function hasEnoughSamples() {
  const totalSamples = Object.values(pathStats).reduce((sum, stats) => sum + (stats.totalCount || 0), 0);
  return totalSamples >= minSampleSize;
}

function updatePathStats(pathName, latency, success) {
  if (!pathStats[pathName]) {
    pathStats[pathName] = { successCount: 0, totalCount: 0, avgLatency: 0, totalLatency: 0 };
  }
  
  const stats = pathStats[pathName];
  stats.totalCount++;
  stats.totalLatency += latency;
  stats.avgLatency = stats.totalLatency / stats.totalCount;
  
  if (success) {
    stats.successCount++;
  }
}
`;
  }
}