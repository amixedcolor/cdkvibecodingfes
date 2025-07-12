import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EntanglementRule {
  /**
   * Name of the entanglement rule
   */
  readonly name: string;
  
  /**
   * Source event pattern to match
   */
  readonly sourcePattern: events.EventPattern;
  
  /**
   * Target event pattern to generate
   */
  readonly targetPattern: {
    source: string;
    detailType: string;
    detail: Record<string, any>;
  };
  
  /**
   * Correlation key to link related events
   */
  readonly correlationKey: string;
  
  /**
   * Maximum time window for entanglement correlation
   */
  readonly correlationWindow?: cdk.Duration;
}

export interface EntanglementBusProps {
  /**
   * Entanglement rules defining event correlations
   */
  readonly entanglementRules: EntanglementRule[];
  
  /**
   * Enable quantum state synchronization
   */
  readonly enableStateSynchronization?: boolean;
  
  /**
   * Custom event bus name
   */
  readonly busName?: string;
}

/**
 * Entanglement Bus - Creates correlated event relationships
 * simulating quantum entanglement between distributed system components
 */
export class EntanglementBus extends Construct {
  public readonly eventBus: events.EventBus;
  public readonly correlationTable: dynamodb.Table;
  public readonly entanglementProcessor: lambda.Function;
  public readonly rules: events.Rule[];
  
  constructor(scope: Construct, id: string, props: EntanglementBusProps) {
    super(scope, id);
    
    // Custom EventBridge bus for quantum events
    this.eventBus = new events.EventBus(this, 'QuantumEventBus', {
      eventBusName: props.busName ?? `${id}-quantum-entanglement-bus`,
      description: 'EventBridge bus for quantum-entangled event correlation'
    });
    
    // DynamoDB table for correlation tracking
    this.correlationTable = new dynamodb.Table(this, 'CorrelationTable', {
      tableName: `${id}-quantum-correlations`,
      partitionKey: { name: 'correlationKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // Entanglement processor Lambda
    this.entanglementProcessor = new lambda.Function(this, 'EntanglementProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createProcessorCode(props)),
      timeout: cdk.Duration.seconds(30),
      environment: {
        EVENT_BUS_NAME: this.eventBus.eventBusName,
        CORRELATION_TABLE_NAME: this.correlationTable.tableName,
        ENTANGLEMENT_RULES: JSON.stringify(props.entanglementRules),
        ENABLE_STATE_SYNC: (props.enableStateSynchronization ?? true).toString()
      },
      logGroup: new logs.LogGroup(this, 'ProcessorLogGroup', {
        logGroupName: `/aws/lambda/${id}-entanglement-processor`,
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    // Grant permissions
    this.eventBus.grantPutEventsTo(this.entanglementProcessor);
    this.correlationTable.grantReadWriteData(this.entanglementProcessor);
    
    // Create entanglement rules
    this.rules = this.createEntanglementRules(props.entanglementRules);
    
    // Add DynamoDB Streams trigger for real-time entanglement
    if (props.enableStateSynchronization) {
      const eventSource = new cdk.aws_lambda_event_sources.DynamoEventSource(this.correlationTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3
      });
      this.entanglementProcessor.addEventSource(eventSource);
    }
  }
  
  private createEntanglementRules(entanglementRules: EntanglementRule[]): events.Rule[] {
    return entanglementRules.map((rule, index) => {
      const eventRule = new events.Rule(this, `EntanglementRule${index}`, {
        ruleName: `${rule.name}-entanglement-rule`,
        description: `Quantum entanglement rule for ${rule.name}`,
        eventBus: this.eventBus,
        eventPattern: rule.sourcePattern,
        enabled: true
      });
      
      // Add Lambda target
      eventRule.addTarget(new targets.LambdaFunction(this.entanglementProcessor, {
        event: events.RuleTargetInput.fromObject({
          ruleId: index,
          ruleName: rule.name,
          originalEvent: events.EventField.fromPath('$'),
          correlationKey: rule.correlationKey,
          timestamp: events.EventField.fromPath('$.time')
        })
      }));
      
      return eventRule;
    });
  }
  
  /**
   * Add a new entanglement rule dynamically
   */
  public addEntanglementRule(rule: EntanglementRule): events.Rule {
    const ruleIndex = this.rules.length;
    const eventRule = new events.Rule(this, `DynamicEntanglementRule${ruleIndex}`, {
      ruleName: `${rule.name}-dynamic-entanglement-rule`,
      description: `Dynamic quantum entanglement rule for ${rule.name}`,
      eventBus: this.eventBus,
      eventPattern: rule.sourcePattern,
      enabled: true
    });
    
    eventRule.addTarget(new targets.LambdaFunction(this.entanglementProcessor, {
      event: events.RuleTargetInput.fromObject({
        ruleId: ruleIndex,
        ruleName: rule.name,
        originalEvent: events.EventField.fromPath('$'),
        correlationKey: rule.correlationKey,
        timestamp: events.EventField.fromPath('$.time')
      })
    }));
    
    this.rules.push(eventRule);
    return eventRule;
  }
  
  private createProcessorCode(props: EntanglementBusProps): string {
    return `
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { DynamoDBClient, PutItemCommand, QueryCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const eventbridge = new EventBridgeClient({});
const dynamodb = new DynamoDBClient({});

const eventBusName = process.env.EVENT_BUS_NAME;
const tableName = process.env.CORRELATION_TABLE_NAME;
const entanglementRules = JSON.parse(process.env.ENTANGLEMENT_RULES);
const enableStateSync = process.env.ENABLE_STATE_SYNC === 'true';

exports.handler = async (event) => {
  try {
    // Handle different event sources
    if (event.Records) {
      // DynamoDB Streams event
      return await handleDynamoDBStreams(event);
    } else {
      // EventBridge event
      return await handleEventBridgeEvent(event);
    }
  } catch (error) {
    console.error('Entanglement Processor Error:', error);
    throw error;
  }
};

async function handleEventBridgeEvent(event) {
  const { ruleId, ruleName, originalEvent, correlationKey, timestamp } = event;
  const rule = entanglementRules[ruleId];
  
  if (!rule) {
    console.warn('Unknown entanglement rule:', ruleId);
    return;
  }
  
  // Store correlation state
  await storeCorrelationState(correlationKey, originalEvent, rule, timestamp);
  
  // Generate entangled events
  const entangledEvents = await generateEntangledEvents(rule, originalEvent, correlationKey);
  
  // Publish entangled events
  if (entangledEvents.length > 0) {
    await publishEvents(entangledEvents);
  }
  
  return {
    statusCode: 200,
    processedRule: ruleName,
    correlationKey: correlationKey,
    entangledEventsCount: entangledEvents.length
  };
}

async function handleDynamoDBStreams(event) {
  console.log('Processing DynamoDB Streams event for quantum state synchronization');
  
  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const newImage = record.dynamodb.NewImage;
      const correlationKey = newImage.correlationKey.S;
      const entanglementGroup = newImage.entanglementGroup?.S;
      
      if (entanglementGroup) {
        await synchronizeEntangledStates(correlationKey, entanglementGroup, newImage);
      }
    }
  }
  
  return { statusCode: 200, message: 'Quantum state synchronization completed' };
}

async function storeCorrelationState(correlationKey, originalEvent, rule, timestamp) {
  const ttl = Math.floor(Date.now() / 1000) + (rule.correlationWindow || 3600); // 1 hour default
  
  const item = {
    correlationKey: correlationKey,
    timestamp: Date.now(),
    eventData: originalEvent,
    ruleName: rule.name,
    entanglementGroup: rule.name,
    state: 'ACTIVE',
    ttl: ttl
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(item)
  }));
}

async function generateEntangledEvents(rule, originalEvent, correlationKey) {
  const entangledEvents = [];
  
  // Extract correlation value from original event
  const correlationValue = extractCorrelationValue(originalEvent, rule.correlationKey);
  
  if (!correlationValue) {
    console.warn('Could not extract correlation value for key:', rule.correlationKey);
    return entangledEvents;
  }
  
  // Create entangled event
  const entangledEvent = {
    Source: rule.targetPattern.source,
    DetailType: rule.targetPattern.detailType,
    Detail: JSON.stringify({
      ...rule.targetPattern.detail,
      correlationKey: correlationKey,
      correlationValue: correlationValue,
      originalEventId: originalEvent.id,
      entanglementTimestamp: new Date().toISOString(),
      quantumState: 'ENTANGLED'
    }),
    EventBusName: eventBusName
  };
  
  entangledEvents.push(entangledEvent);
  
  return entangledEvents;
}

async function publishEvents(events) {
  const chunks = chunkArray(events, 10); // EventBridge limit
  
  for (const chunk of chunks) {
    await eventbridge.send(new PutEventsCommand({
      Entries: chunk
    }));
  }
}

async function synchronizeEntangledStates(correlationKey, entanglementGroup, newImage) {
  // Query for all related entangled states
  const queryParams = {
    TableName: tableName,
    IndexName: 'EntanglementIndex',
    KeyConditionExpression: 'entanglementGroup = :group',
    ExpressionAttributeValues: marshall({
      ':group': entanglementGroup
    })
  };
  
  const result = await dynamodb.send(new QueryCommand(queryParams));
  const relatedStates = result.Items?.map(item => unmarshall(item)) || [];
  
  // Create synchronization events for related states
  const syncEvents = relatedStates
    .filter(state => state.correlationKey !== correlationKey)
    .map(state => ({
      Source: 'quantum.entanglement.sync',
      DetailType: 'Quantum State Synchronization',
      Detail: JSON.stringify({
        sourceCorrelationKey: correlationKey,
        targetCorrelationKey: state.correlationKey,
        entanglementGroup: entanglementGroup,
        syncTimestamp: new Date().toISOString(),
        stateChange: {
          before: state,
          trigger: unmarshall(newImage)
        }
      }),
      EventBusName: eventBusName
    }));
  
  if (syncEvents.length > 0) {
    await publishEvents(syncEvents);
  }
}

function extractCorrelationValue(event, correlationKey) {
  const keys = correlationKey.split('.');
  let value = event;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && value[key] !== undefined) {
      value = value[key];
    } else {
      return null;
    }
  }
  
  return value;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
`;
  }
}