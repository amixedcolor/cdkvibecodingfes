import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { QuantumGate } from '../constructs/quantum-gate';
import { SuperpositionEngine } from '../constructs/superposition-engine';
import { EntanglementBus, EntanglementRule } from '../constructs/entanglement-bus';
import { HedgedRequestPattern } from '../patterns/hedged-request';

/**
 * Quantum Demo Stack - Demonstrates quantum-inspired serverless architecture
 * with a product recommendation system
 */
export class QuantumDemoStack extends cdk.Stack {
  public readonly quantumGate: QuantumGate;
  public readonly superpositionEngine: SuperpositionEngine;
  public readonly entanglementBus: EntanglementBus;
  public readonly hedgedPattern: HedgedRequestPattern;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // DynamoDB tables for demo data
    const productsTable = this.createProductsTable();
    const userPreferencesTable = this.createUserPreferencesTable();
    const recommendationsTable = this.createRecommendationsTable();
    
    // Create multiple recommendation algorithms as Lambda functions
    const algorithmFunctions = this.createRecommendationAlgorithms(
      productsTable,
      userPreferencesTable,
      recommendationsTable
    );
    
    // Create Quantum Gate for probabilistic API routing
    this.quantumGate = new QuantumGate(this, 'ProductRecommendationGate', {
      executionPaths: [
        {
          name: 'collaborative-filtering',
          weight: 40,
          handler: algorithmFunctions.collaborativeFiltering
        },
        {
          name: 'content-based',
          weight: 30,
          handler: algorithmFunctions.contentBased
        },
        {
          name: 'hybrid-ml',
          weight: 30,
          handler: algorithmFunctions.hybridML
        }
      ],
      enableAdaptiveRouting: true,
      minSampleSize: 50
    });
    
    // Create Superposition Engine for parallel algorithm execution
    this.superpositionEngine = new SuperpositionEngine(this, 'RecommendationSuperposition', {
      parallelFunctions: [
        algorithmFunctions.collaborativeFiltering,
        algorithmFunctions.contentBased,
        algorithmFunctions.hybridML
      ],
      enableHedgedRequests: true,
      hedgedThresholdMs: 200,
      maxExecutionTime: cdk.Duration.seconds(30)
    });
    
    // Create Entanglement Bus for event correlation
    this.entanglementBus = this.createEntanglementBus();
    
    // Create Hedged Request Pattern
    this.hedgedPattern = new HedgedRequestPattern(this, 'RecommendationHedged', {
      primaryFunction: algorithmFunctions.collaborativeFiltering,
      backupFunctions: [algorithmFunctions.contentBased, algorithmFunctions.hybridML],
      hedgeThresholdMs: 150,
      maxHedgedRequests: 2,
      enableSpeculativeExecution: true
    });
    
    // Output important endpoints
    new cdk.CfnOutput(this, 'QuantumGateApiUrl', {
      value: this.quantumGate.api.url,
      description: 'Quantum Gate API URL for product recommendations'
    });
    
    new cdk.CfnOutput(this, 'SuperpositionStateMachineArn', {
      value: this.superpositionEngine.stateMachine.stateMachineArn,
      description: 'Superposition Engine State Machine ARN'
    });
    
    new cdk.CfnOutput(this, 'EntanglementBusName', {
      value: this.entanglementBus.eventBus.eventBusName,
      description: 'Quantum Entanglement Bus Name'
    });
  }
  
  private createProductsTable(): dynamodb.Table {
    return new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'quantum-products',
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
  
  private createUserPreferencesTable(): dynamodb.Table {
    return new dynamodb.Table(this, 'UserPreferencesTable', {
      tableName: 'quantum-user-preferences',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'preferenceType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
  
  private createRecommendationsTable(): dynamodb.Table {
    return new dynamodb.Table(this, 'RecommendationsTable', {
      tableName: 'quantum-recommendations',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
  
  private createRecommendationAlgorithms(
    productsTable: dynamodb.Table,
    userPreferencesTable: dynamodb.Table,
    recommendationsTable: dynamodb.Table
  ) {
    const commonEnvironment = {
      PRODUCTS_TABLE_NAME: productsTable.tableName,
      USER_PREFERENCES_TABLE_NAME: userPreferencesTable.tableName,
      RECOMMENDATIONS_TABLE_NAME: recommendationsTable.tableName
    };
    
    // Collaborative Filtering Algorithm
    const collaborativeFiltering = new lambda.Function(this, 'CollaborativeFilteringFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createCollaborativeFilteringCode()),
      timeout: cdk.Duration.seconds(30),
      environment: commonEnvironment,
      logGroup: new logs.LogGroup(this, 'CollaborativeFilteringLogGroup', {
        logGroupName: '/aws/lambda/quantum-collaborative-filtering',
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    // Content-Based Filtering Algorithm
    const contentBased = new lambda.Function(this, 'ContentBasedFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createContentBasedCode()),
      timeout: cdk.Duration.seconds(30),
      environment: commonEnvironment,
      logGroup: new logs.LogGroup(this, 'ContentBasedLogGroup', {
        logGroupName: '/aws/lambda/quantum-content-based',
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    // Hybrid ML Algorithm
    const hybridML = new lambda.Function(this, 'HybridMLFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(this.createHybridMLCode()),
      timeout: cdk.Duration.seconds(30),
      environment: commonEnvironment,
      logGroup: new logs.LogGroup(this, 'HybridMLLogGroup', {
        logGroupName: '/aws/lambda/quantum-hybrid-ml',
        retention: logs.RetentionDays.ONE_WEEK
      })
    });
    
    // Grant DynamoDB permissions
    [collaborativeFiltering, contentBased, hybridML].forEach(func => {
      productsTable.grantReadData(func);
      userPreferencesTable.grantReadData(func);
      recommendationsTable.grantReadWriteData(func);
    });
    
    return {
      collaborativeFiltering,
      contentBased,
      hybridML
    };
  }
  
  private createEntanglementBus(): EntanglementBus {
    const entanglementRules: EntanglementRule[] = [
      {
        name: 'UserBehaviorEntanglement',
        sourcePattern: {
          source: ['quantum.recommendations'],
          detailType: ['User Recommendation Request']
        },
        targetPattern: {
          source: 'quantum.analytics',
          detailType: 'User Behavior Analysis',
          detail: {
            correlationType: 'user-behavior',
            analysisType: 'recommendation-pattern'
          }
        },
        correlationKey: 'detail.userId',
        correlationWindow: cdk.Duration.minutes(30)
      },
      {
        name: 'ProductPopularityEntanglement',
        sourcePattern: {
          source: ['quantum.recommendations'],
          detailType: ['Product Recommendation Generated']
        },
        targetPattern: {
          source: 'quantum.inventory',
          detailType: 'Product Popularity Update',
          detail: {
            correlationType: 'product-popularity',
            updateType: 'recommendation-driven'
          }
        },
        correlationKey: 'detail.productId',
        correlationWindow: cdk.Duration.minutes(15)
      }
    ];
    
    return new EntanglementBus(this, 'RecommendationEntanglement', {
      entanglementRules,
      enableStateSynchronization: true,
      busName: 'quantum-recommendation-entanglement'
    });
  }
  
  private createCollaborativeFilteringCode(): string {
    return `
const { DynamoDBClient, QueryCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const startTime = Date.now();
  
  try {
    const { userId, limit = 10 } = event.pathParameters || event;
    
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      };
    }
    
    // Simulate collaborative filtering algorithm
    const recommendations = await generateCollaborativeRecommendations(userId, limit);
    
    // Store recommendations
    await storeRecommendations(userId, recommendations, 'collaborative-filtering');
    
    const executionTime = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Algorithm': 'collaborative-filtering',
        'X-Execution-Time': executionTime.toString()
      },
      body: JSON.stringify({
        algorithm: 'collaborative-filtering',
        userId: userId,
        recommendations: recommendations,
        executionTime: executionTime,
        quantumPath: 'collaborative-superposition'
      })
    };
    
  } catch (error) {
    console.error('Collaborative Filtering Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Collaborative filtering algorithm failed',
        algorithm: 'collaborative-filtering'
      })
    };
  }
};

async function generateCollaborativeRecommendations(userId, limit) {
  // Simulate collaborative filtering logic
  // In a real implementation, this would analyze user similarities
  const baseProducts = [
    { productId: 'prod-1', score: 0.95, reason: 'Users like you also liked' },
    { productId: 'prod-2', score: 0.89, reason: 'Popular in your segment' },
    { productId: 'prod-3', score: 0.84, reason: 'Trending among similar users' },
    { productId: 'prod-4', score: 0.78, reason: 'Frequently bought together' },
    { productId: 'prod-5', score: 0.72, reason: 'Recommended by community' }
  ];
  
  // Add some randomness to simulate different user contexts
  const shuffled = baseProducts
    .map(product => ({
      ...product,
      score: product.score * (0.8 + Math.random() * 0.4) // ±20% variance
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return shuffled;
}

async function storeRecommendations(userId, recommendations, algorithm) {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400; // 24 hours
  
  const item = {
    userId: userId,
    timestamp: timestamp,
    algorithm: algorithm,
    recommendations: recommendations,
    ttl: ttl
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: process.env.RECOMMENDATIONS_TABLE_NAME,
    Item: marshall(item)
  }));
}
`;
  }
  
  private createContentBasedCode(): string {
    return `
const { DynamoDBClient, QueryCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const startTime = Date.now();
  
  try {
    const { userId, limit = 10 } = event.pathParameters || event;
    
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      };
    }
    
    // Get user preferences
    const userPreferences = await getUserPreferences(userId);
    
    // Generate content-based recommendations
    const recommendations = await generateContentBasedRecommendations(userPreferences, limit);
    
    // Store recommendations
    await storeRecommendations(userId, recommendations, 'content-based');
    
    const executionTime = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Algorithm': 'content-based',
        'X-Execution-Time': executionTime.toString()
      },
      body: JSON.stringify({
        algorithm: 'content-based',
        userId: userId,
        recommendations: recommendations,
        userPreferences: userPreferences,
        executionTime: executionTime,
        quantumPath: 'content-superposition'
      })
    };
    
  } catch (error) {
    console.error('Content-Based Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Content-based algorithm failed',
        algorithm: 'content-based'
      })
    };
  }
};

async function getUserPreferences(userId) {
  try {
    const params = {
      TableName: process.env.USER_PREFERENCES_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId
      })
    };
    
    const result = await dynamodb.send(new QueryCommand(params));
    const preferences = result.Items?.map(item => unmarshall(item)) || [];
    
    // Convert to preference object
    const preferenceObj = {};
    preferences.forEach(pref => {
      preferenceObj[pref.preferenceType] = pref.value;
    });
    
    return preferenceObj;
  } catch (error) {
    console.warn('Failed to get user preferences:', error);
    return { category: 'electronics', priceRange: 'medium' }; // default
  }
}

async function generateContentBasedRecommendations(preferences, limit) {
  // Simulate content-based filtering based on user preferences
  const baseProducts = [
    { productId: 'prod-6', score: 0.92, reason: 'Matches your category preference' },
    { productId: 'prod-7', score: 0.87, reason: 'Similar features to your purchases' },
    { productId: 'prod-8', score: 0.83, reason: 'In your preferred price range' },
    { productId: 'prod-9', score: 0.79, reason: 'High rating in your category' },
    { productId: 'prod-10', score: 0.75, reason: 'Similar specifications' }
  ];
  
  // Adjust scores based on preferences
  const adjusted = baseProducts.map(product => ({
    ...product,
    score: product.score * (0.9 + Math.random() * 0.2), // ±10% variance
    preferences: preferences
  }));
  
  return adjusted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function storeRecommendations(userId, recommendations, algorithm) {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400; // 24 hours
  
  const item = {
    userId: userId,
    timestamp: timestamp,
    algorithm: algorithm,
    recommendations: recommendations,
    ttl: ttl
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: process.env.RECOMMENDATIONS_TABLE_NAME,
    Item: marshall(item)
  }));
}
`;
  }
  
  private createHybridMLCode(): string {
    return `
const { DynamoDBClient, QueryCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const startTime = Date.now();
  
  try {
    const { userId, limit = 10 } = event.pathParameters || event;
    
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      };
    }
    
    // Simulate ML model inference
    const mlPredictions = await generateMLPredictions(userId);
    
    // Generate hybrid recommendations
    const recommendations = await generateHybridRecommendations(userId, mlPredictions, limit);
    
    // Store recommendations
    await storeRecommendations(userId, recommendations, 'hybrid-ml');
    
    const executionTime = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Algorithm': 'hybrid-ml',
        'X-Execution-Time': executionTime.toString()
      },
      body: JSON.stringify({
        algorithm: 'hybrid-ml',
        userId: userId,
        recommendations: recommendations,
        mlConfidence: mlPredictions.confidence,
        executionTime: executionTime,
        quantumPath: 'hybrid-superposition'
      })
    };
    
  } catch (error) {
    console.error('Hybrid ML Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Hybrid ML algorithm failed',
        algorithm: 'hybrid-ml'
      })
    };
  }
};

async function generateMLPredictions(userId) {
  // Simulate ML model inference with realistic latency
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
  
  return {
    userEmbedding: Array.from({ length: 10 }, () => Math.random()),
    confidence: 0.85 + Math.random() * 0.15,
    modelVersion: 'v2.1.0'
  };
}

async function generateHybridRecommendations(userId, mlPredictions, limit) {
  // Simulate hybrid approach combining multiple signals
  const baseProducts = [
    { productId: 'prod-11', score: 0.94, reason: 'ML model high confidence' },
    { productId: 'prod-12', score: 0.91, reason: 'Hybrid collaborative + content' },
    { productId: 'prod-13', score: 0.88, reason: 'Deep learning recommendation' },
    { productId: 'prod-14', score: 0.85, reason: 'Multi-modal feature matching' },
    { productId: 'prod-15', score: 0.82, reason: 'Ensemble model prediction' }
  ];
  
  // Apply ML confidence weighting
  const weighted = baseProducts.map(product => ({
    ...product,
    score: product.score * mlPredictions.confidence * (0.95 + Math.random() * 0.1),
    mlConfidence: mlPredictions.confidence,
    userEmbeddingDistance: Math.random() * 0.3 // Simulated embedding distance
  }));
  
  return weighted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function storeRecommendations(userId, recommendations, algorithm) {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400; // 24 hours
  
  const item = {
    userId: userId,
    timestamp: timestamp,
    algorithm: algorithm,
    recommendations: recommendations,
    ttl: ttl
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: process.env.RECOMMENDATIONS_TABLE_NAME,
    Item: marshall(item)
  }));
}
`;
  }
}