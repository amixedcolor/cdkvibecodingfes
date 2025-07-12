import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  /**
   * Lambda functions to monitor
   */
  readonly functions: lambda.Function[];
  
  /**
   * State machines to monitor
   */
  readonly stateMachines?: string[];
  
  /**
   * API Gateways to monitor
   */
  readonly apiGateways?: string[];
}

/**
 * Quantum Monitoring Stack - Creates comprehensive monitoring dashboards
 * for the quantum-inspired serverless architecture
 */
export class MonitoringStack extends cdk.Stack {
  public readonly quantumDashboard: cloudwatch.Dashboard;
  public readonly alarms: cloudwatch.Alarm[];
  
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    
    this.alarms = [];
    
    // Create main quantum dashboard
    this.quantumDashboard = new cloudwatch.Dashboard(this, 'QuantumDashboard', {
      dashboardName: 'quantum-serverless-architecture',
      defaultInterval: cdk.Duration.hours(1)
    });
    
    // Add widgets to dashboard
    this.addOverviewWidgets();
    this.addLatencyWidgets(props.functions);
    this.addQuantumMetricsWidgets(props.functions);
    this.addErrorAnalysisWidgets(props.functions);
    
    if (props.stateMachines) {
      this.addStepFunctionsWidgets(props.stateMachines);
    }
    
    if (props.apiGateways) {
      this.addApiGatewayWidgets(props.apiGateways);
    }
    
    // Create alarms
    this.createQuantumAlarms(props.functions);
  }
  
  private addOverviewWidgets(): void {
    // System overview row
    this.quantumDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `
# 🌌 Quantum-Inspired Serverless Architecture Dashboard

This dashboard monitors the performance and health of our quantum-inspired serverless system:

## Key Metrics:
- **Quantum Superposition**: Parallel execution performance
- **Entanglement Correlation**: Event relationship tracking  
- **Quantum Gates**: Probabilistic routing efficiency
- **Hedged Requests**: Tail latency optimization

## Architecture Components:
- Multi-path parallel execution (Superposition Engine)
- Probabilistic load balancing (Quantum Gates)
- Event correlation system (Entanglement Bus)
- Adaptive request hedging patterns

---
`,
        width: 24,
        height: 6
      })
    );
  }
  
  private addLatencyWidgets(functions: lambda.Function[]): void {
    // Latency comparison widget
    const latencyMetrics = functions.map(func => 
      func.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5)
      })
    );
    
    const p99Metrics = functions.map(func => 
      func.metricDuration({
        statistic: 'p99',
        period: cdk.Duration.minutes(5)
      })
    );
    
    this.quantumDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '⚡ Quantum Path Latency Comparison',
        left: latencyMetrics,
        right: p99Metrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Average Latency (ms)',
          showUnits: false
        },
        rightYAxis: {
          label: 'P99 Latency (ms)',
          showUnits: false
        }
      }),
      
      new cloudwatch.SingleValueWidget({
        title: '🎯 Quantum Efficiency Score',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '(1 / (AVG(METRICS()) / 100)) * 100',
            usingMetrics: {
              ...Object.fromEntries(
                latencyMetrics.map((metric, index) => [`m${index}`, metric])
              )
            },
            label: 'Efficiency %',
            period: cdk.Duration.minutes(5)
          })
        ],
        width: 6,
        height: 6
      }),
      
      new cloudwatch.SingleValueWidget({
        title: '🌊 Superposition Collapse Rate',
        metrics: [
          new cloudwatch.MathExpression({
            expression: 'SUM(METRICS()) / PERIOD(m1)',
            usingMetrics: {
              ...Object.fromEntries(
                functions.map((func, index) => [
                  `m${index}`, 
                  func.metricInvocations({ period: cdk.Duration.minutes(5) })
                ])
              )
            },
            label: 'Collapses/min'
          })
        ],
        width: 6,
        height: 6
      })
    );
  }
  
  private addQuantumMetricsWidgets(functions: lambda.Function[]): void {
    // Custom quantum metrics
    const invocationMetrics = functions.map(func => 
      func.metricInvocations({
        period: cdk.Duration.minutes(5)
      })
    );
    
    const errorMetrics = functions.map(func => 
      func.metricErrors({
        period: cdk.Duration.minutes(5)
      })
    );
    
    this.quantumDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '🔄 Quantum State Transitions',
        left: invocationMetrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Invocations/min',
          showUnits: false
        }
      }),
      
      new cloudwatch.GraphWidget({
        title: '⚠️ Quantum Decoherence Events',
        left: errorMetrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Errors/min',
          showUnits: false
        }
      })
    );
  }
  
  private addErrorAnalysisWidgets(functions: lambda.Function[]): void {
    // Error rate calculation
    const errorRateMetrics = functions.map(func => 
      new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: func.metricErrors({ period: cdk.Duration.minutes(5) }),
          invocations: func.metricInvocations({ period: cdk.Duration.minutes(5) })
        },
        label: `${func.functionName} Error Rate %`
      })
    );
    
    this.quantumDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '📊 Quantum Path Error Analysis',
        left: errorRateMetrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Error Rate %',
          showUnits: false,
          min: 0,
          max: 5
        }
      }),
      
      new cloudwatch.TextWidget({
        markdown: `
## 🔍 Recent Quantum Anomalies

Check CloudWatch Logs for detailed error analysis:
- /aws/lambda/quantum-*
- /aws/stepfunctions/quantum-*

Use Log Insights queries to investigate quantum decoherence events.
        `,
        width: 12,
        height: 6
      })
    );
  }
  
  private addStepFunctionsWidgets(stateMachines: string[]): void {
    const executionMetrics = stateMachines.map(sm => 
      new cloudwatch.Metric({
        namespace: 'AWS/States',
        metricName: 'ExecutionsSucceeded',
        dimensionsMap: {
          StateMachineArn: sm
        },
        period: cdk.Duration.minutes(5)
      })
    );
    
    this.quantumDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '🔀 Superposition Engine Performance',
        left: executionMetrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Successful Executions',
          showUnits: false
        }
      })
    );
  }
  
  private addApiGatewayWidgets(apiGateways: string[]): void {
    const latencyMetrics = apiGateways.map(api => 
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: api
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average'
      })
    );
    
    this.quantumDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '🚪 Quantum Gate Response Times',
        left: latencyMetrics,
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'API Latency (ms)',
          showUnits: false
        }
      })
    );
  }
  
  private createQuantumAlarms(functions: lambda.Function[]): void {
    functions.forEach((func, index) => {
      // High error rate alarm
      const errorAlarm = new cloudwatch.Alarm(this, `QuantumErrorAlarm${index}`, {
        alarmName: `quantum-${func.functionName}-high-errors`,
        alarmDescription: `High error rate detected in quantum path ${func.functionName}`,
        metric: new cloudwatch.MathExpression({
          expression: '(errors / invocations) * 100',
          usingMetrics: {
            errors: func.metricErrors({ period: cdk.Duration.minutes(5) }),
            invocations: func.metricInvocations({ period: cdk.Duration.minutes(5) })
          }
        }),
        threshold: 5, // 5% error rate
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      
      // High latency alarm
      const latencyAlarm = new cloudwatch.Alarm(this, `QuantumLatencyAlarm${index}`, {
        alarmName: `quantum-${func.functionName}-high-latency`,
        alarmDescription: `High latency detected in quantum path ${func.functionName}`,
        metric: func.metricDuration({
          statistic: 'p99',
          period: cdk.Duration.minutes(5)
        }),
        threshold: 5000, // 5 seconds
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
      });
      
      this.alarms.push(errorAlarm, latencyAlarm);
    });
    
    // System-wide quantum decoherence alarm
    const totalErrorRate = new cloudwatch.MathExpression({
      expression: '(SUM([errors1, errors2, errors3]) / SUM([inv1, inv2, inv3])) * 100',
      usingMetrics: {
        ...Object.fromEntries(
          functions.map((func, index) => [
            `errors${index + 1}`, 
            func.metricErrors({ period: cdk.Duration.minutes(5) })
          ])
        ),
        ...Object.fromEntries(
          functions.map((func, index) => [
            `inv${index + 1}`, 
            func.metricInvocations({ period: cdk.Duration.minutes(5) })
          ])
        )
      }
    });
    
    const systemAlarm = new cloudwatch.Alarm(this, 'QuantumSystemAlarm', {
      alarmName: 'quantum-system-decoherence',
      alarmDescription: 'Critical quantum decoherence detected across the system',
      metric: totalErrorRate,
      threshold: 10, // 10% system-wide error rate
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    
    this.alarms.push(systemAlarm);
  }
}