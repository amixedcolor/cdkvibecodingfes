import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface SuperpositionEngineProps {
  /**
   * Lambda functions to execute in parallel (quantum superposition)
   */
  readonly parallelFunctions: lambda.Function[];
  
  /**
   * Maximum execution time before quantum decoherence (timeout)
   */
  readonly maxExecutionTime?: cdk.Duration;
  
  /**
   * Enable hedged requests (start additional parallel executions on delay)
   */
  readonly enableHedgedRequests?: boolean;
  
  /**
   * Threshold for triggering hedged requests (percentile latency)
   */
  readonly hedgedThresholdMs?: number;
}

/**
 * Superposition Engine - Executes multiple Lambda functions in parallel
 * and returns the first successful result (quantum measurement)
 */
export class SuperpositionEngine extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;
  public readonly resultTable: dynamodb.Table;
  public readonly coordinatorFunction: lambda.Function;
  
  constructor(scope: Construct, id: string, props: SuperpositionEngineProps) {
    super(scope, id);
    
    // DynamoDB table to store race results
    this.resultTable = new dynamodb.Table(this, 'ResultTable', {
      tableName: `${id}-superposition-results`,
      partitionKey: { name: 'executionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // Coordinator Lambda for result management
    this.coordinatorFunction = new lambda.Function(this, 'CoordinatorFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createCoordinatorCode()),
      timeout: cdk.Duration.seconds(30),
      environment: {
        RESULT_TABLE_NAME: this.resultTable.tableName,
        ENABLE_HEDGED_REQUESTS: (props.enableHedgedRequests ?? true).toString(),
        HEDGED_THRESHOLD_MS: (props.hedgedThresholdMs ?? 200).toString()
      },
      logGroup: new logs.LogGroup(this, 'CoordinatorLogGroup', {
        logGroupName: `/aws/lambda/${id}-coordinator`,
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    this.resultTable.grantReadWriteData(this.coordinatorFunction);
    
    // Create parallel execution tasks
    const parallelTasks = this.createParallelTasks(props.parallelFunctions);
    
    // Step Functions definition with quantum-inspired workflow
    const definition = this.createQuantumWorkflow(parallelTasks, props);
    
    // State Machine
    this.stateMachine = new stepfunctions.StateMachine(this, 'QuantumStateMachine', {
      definition,
      timeout: props.maxExecutionTime ?? cdk.Duration.minutes(5),
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
          logGroupName: `/aws/stepfunctions/${id}-quantum`,
          retention: logs.RetentionDays.ONE_WEEK
        }),
        level: stepfunctions.LogLevel.ALL
      },
      tracingEnabled: true
    });
    
    // Grant permissions
    props.parallelFunctions.forEach(func => {
      func.grantInvoke(this.stateMachine.role);
    });
    
    this.resultTable.grantReadWriteData(this.stateMachine.role);
    this.coordinatorFunction.grantInvoke(this.stateMachine.role);
  }
  
  private createParallelTasks(functions: lambda.Function[]): stepfunctions.IChainable {
    const tasks = functions.map((func, index) => {
      return new stepfunctionsTasks.LambdaInvoke(this, `QuantumPath${index}`, {
        lambdaFunction: func,
        payload: stepfunctions.TaskInput.fromObject({
          'executionId.$': '$.executionId',
          'pathId': index,
          'input.$': '$.input',
          'metadata.$': '$.metadata'
        }),
        resultPath: `$.results[${index}]`,
        timeout: cdk.Duration.seconds(30),
        retryOnServiceExceptions: false
      });
    });
    
    return new stepfunctions.Parallel(this, 'QuantumParallel', {})
      .branch(...tasks)
      .addCatch(new stepfunctions.Pass(this, 'HandleParallelFailure', {
        result: stepfunctions.Result.fromObject({
          error: 'All quantum paths failed',
          type: 'QuantumDecoherence'
        }),
        resultPath: '$.error'
      }));
  }
  
  private createQuantumWorkflow(parallelTasks: stepfunctions.IChainable, props: SuperpositionEngineProps): stepfunctions.IChainable {
    // Initialize execution
    const initState = new stepfunctions.Pass(this, 'InitializeQuantumState', {
      result: stepfunctions.Result.fromObject({
        startTime: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
        executionId: stepfunctions.JsonPath.stringAt('$$.Execution.Name')
      }),
      resultPath: '$.metadata'
    });
    
    // Store initial state
    const storeInitialState = new stepfunctionsTasks.LambdaInvoke(this, 'StoreInitialState', {
      lambdaFunction: this.coordinatorFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'initialize',
        'executionId.$': '$.metadata.executionId',
        'startTime.$': '$.metadata.startTime',
        'input.$': '$.input'
      }),
      resultPath: '$.initResult'
    });
    
    // Quantum measurement (result collapse)
    const measurementState = new stepfunctionsTasks.LambdaInvoke(this, 'QuantumMeasurement', {
      lambdaFunction: this.coordinatorFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'measure',
        'executionId.$': '$.metadata.executionId',
        'results.$': '$.results',
        'metadata.$': '$.metadata'
      }),
      resultPath: '$.measurement'
    });
    
    // Success state
    const successState = new stepfunctions.Succeed(this, 'QuantumSuccess', {
      comment: 'Quantum superposition successfully collapsed to optimal result'
    });
    
    // Failure state
    const failureState = new stepfunctions.Fail(this, 'QuantumFailure', {
      cause: 'All quantum execution paths failed',
      error: 'QuantumDecoherence'
    });
    
    // Choice state for result evaluation
    const evaluateResults = new stepfunctions.Choice(this, 'EvaluateQuantumResults')
      .when(
        stepfunctions.Condition.isPresent('$.measurement.result'),
        successState
      )
      .otherwise(failureState);
    
    // Build the workflow
    return stepfunctions.Chain.start(initState)
      .next(storeInitialState)
      .next(parallelTasks)
      .next(measurementState)
      .next(evaluateResults);
  }
  
  private createCoordinatorCode(): string {
    return `
const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const tableName = process.env.RESULT_TABLE_NAME;

exports.handler = async (event) => {
  try {
    switch (event.action) {
      case 'initialize':
        return await initializeExecution(event);
      case 'measure':
        return await performQuantumMeasurement(event);
      default:
        throw new Error('Unknown action: ' + event.action);
    }
  } catch (error) {
    console.error('Coordinator Error:', error);
    throw error;
  }
};

async function initializeExecution(event) {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400; // 24 hours TTL
  
  const item = {
    executionId: event.executionId,
    timestamp: timestamp,
    type: 'INITIALIZATION',
    input: event.input,
    startTime: event.startTime,
    ttl: ttl
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(item)
  }));
  
  return {
    status: 'initialized',
    executionId: event.executionId,
    timestamp: timestamp
  };
}

async function performQuantumMeasurement(event) {
  const results = event.results || [];
  const executionId = event.executionId;
  const timestamp = Date.now();
  
  // Find the fastest successful result (quantum collapse)
  let winningResult = null;
  let fastestTime = Infinity;
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    
    if (result && result.Payload) {
      try {
        const payload = JSON.parse(result.Payload);
        const executionTime = payload.executionTime || timestamp;
        
        if (payload.statusCode === 200 && executionTime < fastestTime) {
          fastestTime = executionTime;
          winningResult = {
            pathId: i,
            result: payload,
            executionTime: executionTime,
            latency: executionTime - (event.metadata.startTime ? new Date(event.metadata.startTime).getTime() : timestamp)
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse result:', parseError);
      }
    }
  }
  
  // Store measurement result
  const measurementRecord = {
    executionId: executionId,
    timestamp: timestamp,
    type: 'MEASUREMENT',
    winningPath: winningResult?.pathId,
    totalPaths: results.length,
    successfulPaths: results.filter(r => r && r.Payload).length,
    latency: winningResult?.latency,
    ttl: Math.floor(timestamp / 1000) + 86400
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(measurementRecord)
  }));
  
  if (winningResult) {
    return {
      status: 'collapsed',
      result: winningResult.result,
      metadata: {
        winningPath: winningResult.pathId,
        latency: winningResult.latency,
        totalPaths: results.length,
        quantumEfficiency: (winningResult.latency / (results.length * 100)).toFixed(2)
      }
    };
  } else {
    return {
      status: 'decoherent',
      error: 'No successful quantum path found',
      metadata: {
        totalPaths: results.length,
        failedPaths: results.length
      }
    };
  }
}
`;
  }
}