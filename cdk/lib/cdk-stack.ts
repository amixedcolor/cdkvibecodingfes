import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { QuantumDemoStack } from './stacks/quantum-demo-stack';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Deploy the Quantum-Inspired Serverless Architecture Demo
    new QuantumDemoStack(this, 'QuantumDemo', {
      description: 'Quantum-Inspired Serverless Architecture with Product Recommendations',
      tags: {
        Project: 'QuantumServerless',
        Environment: 'Demo',
        Architecture: 'QuantumInspired'
      }
    });
  }
}
