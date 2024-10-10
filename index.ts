import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const providerConfig = new pulumi.Config("aws");
const region = providerConfig.require("region");

const config = new pulumi.Config();
const appName = config.require("appName");
const cidrBlock = config.get("cidrBlock") || "10.0.0.0/16";
const billingId = config.get("billingId") || "123456";
const bucketName = config.get("bucketName") || `${appName}-bucket-${billingId}`;
const instanceType = config.get("instanceType") || "t2.micro";
const sshKeyPairName = config.get("sshKeyPairName"); // Manually create a key pair in the AWS Console
const domainName = config.get("domainName");
const asgMinSize = config.getNumber("asgMinSize") || 1;
const asgMaxSize = config.getNumber("asgMaxSize") || 5;
const asgDesiredCapacity = config.getNumber("asgDesiredCapacity") || 2;
const cpuHighThreshold = config.getNumber("cpuHighThreshold") || 80;
const cpuLowThreshold = config.getNumber("cpuLowThreshold") || 20;
const myIP = config.get("myIP") || "192.168.1.1";
const httpsEnabled = config.getBoolean("httpsEnabled") || false;

// Virtual Private Cloud
const vpc = new awsx.ec2.Vpc(`${appName}-vpc`, {
  cidrBlock: cidrBlock,
  numberOfAvailabilityZones: 2,
  tags: {
    Name: `${appName}-vpc`,
    BillingId: billingId
  },
});

// S3 bucket
const bucket = new aws.s3.Bucket(`${appName}-bucket`, {
  bucket: bucketName,
  tags: {
    Name: `${appName}-bucket`,
    BillingId: billingId
  }
});

// IAM role and policy for EC2 instances to access the S3 bucket
const role = new aws.iam.Role(`${appName}-instances-role`, {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
  tags: {
    Name: `${appName}-instances-role`,
    BillingId: billingId
  }
});

new aws.iam.RolePolicy(`${appName}-bucket-access-policy`, {
  role: role.id,
  policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:PutObject",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    "${bucket.arn}",
                    "${bucket.arn}/*"
                ]
            }
        ]
    }`,
});

// IAM instance profile
const instanceIAMProfile = new aws.iam.InstanceProfile(`${appName}-instance-iam-profile`, {
  role: role.name,
  tags: {
    Name: `${appName}-instance-iam-profile`,
    BillingId: billingId
  }
});

// Security Group for the Load Balancer
const lbSecurityGroup = new aws.ec2.SecurityGroup(`${appName}-lb-sg`, {
  vpcId: vpc.vpcId,
  ingress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
  tags: {
    Name: `${appName}-lb-sg`,
    BillingId: billingId
  }
});

// Security group for the EC2 instances
const instanceSecurityGroup = new aws.ec2.SecurityGroup(`${appName}-instance-sg`, {
  vpcId: vpc.vpcId,
  description: "Allow all inbound traffic from the VPC",
  ingress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: [vpc.vpc.cidrBlock] },
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: [`${myIP}/32`] }
  ],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
  tags: {
    Name: `${appName}-instance-sg`,
    BillingId: billingId
  },
});

// Load Balancer
const lb = new aws.lb.LoadBalancer(`${appName}-lb`, {
  securityGroups: [lbSecurityGroup.id],
  subnets: vpc.publicSubnetIds,
  tags: {
    Name: `${appName}-lb`,
    BillingId: billingId
  }
});

// Target Group
const tg = new aws.lb.TargetGroup(`${appName}-lb-tg`, {
  port: 80,
  protocol: "HTTP",
  targetType: "instance",
  vpcId: vpc.vpcId,
  tags: {
    Name: `${appName}-tg`,
    BillingId: billingId
  }
});

// HTTP Listener
new aws.lb.Listener(`${appName}-http-listener`, {
  loadBalancerArn: lb.arn,
  port: 80,
  defaultActions: [
    {
      type: "forward",
      targetGroupArn: tg.arn,
    },
  ],
});

const userData = Buffer.from(`#!/bin/bash
  INSTANCE_ID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
  echo "<h1>Hello from instance \${INSTANCE_ID}</h1>" > index.html
  nohup python -m SimpleHTTPServer 80 &`).toString('base64');

// Launch Template for the EC2 instances
const launchTemplate = new aws.ec2.LaunchTemplate(`${appName}-instance-launch-template`, {
  imageId: aws.ec2.getAmi({
    filters: [
      { name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] },
    ],
    owners: ["amazon"],
    mostRecent: true,
  }).then(result => result.id),
  instanceType: instanceType,
  vpcSecurityGroupIds: [instanceSecurityGroup.id],
  iamInstanceProfile: { arn: instanceIAMProfile.arn },
  userData: userData,
  keyName: sshKeyPairName
});

// Auto Scaling Group
const asg = new aws.autoscaling.Group(`${appName}-asg`, {
  vpcZoneIdentifiers: vpc.privateSubnetIds,
  launchTemplate: { id: launchTemplate.id, version: "$Latest" },
  minSize: asgMinSize,
  maxSize: asgMaxSize,
  desiredCapacity: asgDesiredCapacity,
  targetGroupArns: [tg.arn],
  healthCheckType: "ELB",
  healthCheckGracePeriod: 300,
  tags: [
    { key: "Name", value: `${appName}-asg`, propagateAtLaunch: true },
    { key: "BillingId", value: billingId, propagateAtLaunch: true }
  ],
});

// CPU Utilization Alarms and Actions
const scaleUpPolicy = new aws.autoscaling.Policy(`${appName}-scale-up`, {
  autoscalingGroupName: asg.name,
  adjustmentType: "ChangeInCapacity",
  scalingAdjustment: 1,
  cooldown: 300,
});

const scaleDownPolicy = new aws.autoscaling.Policy(`${appName}-scale-down`, {
  autoscalingGroupName: asg.name,
  adjustmentType: "ChangeInCapacity",
  scalingAdjustment: -1,
  cooldown: 300,
});

new aws.cloudwatch.MetricAlarm(`${appName}-cpu-high-alarm`, {
  comparisonOperator: "GreaterThanOrEqualToThreshold",
  evaluationPeriods: 2,
  metricName: "CPUUtilization",
  namespace: "AWS/EC2",
  period: 60,
  statistic: "Average",
  threshold: cpuHighThreshold,
  dimensions: { AutoScalingGroupName: asg.name },
  alarmDescription: `Triggers a scale-out when CPU > ${cpuHighThreshold}%`,
  alarmActions: [scaleUpPolicy.arn],
  tags: {
    Name: `${appName}-cpu-high-alarm`,
    BillingId: billingId
  }
});

new aws.cloudwatch.MetricAlarm(`${appName}-cpu-low-alarm`, {
  comparisonOperator: "LessThanOrEqualToThreshold",
  evaluationPeriods: 2,
  metricName: "CPUUtilization",
  namespace: "AWS/EC2",
  period: 60,
  statistic: "Average",
  threshold: cpuLowThreshold,
  dimensions: { AutoScalingGroupName: asg.name },
  alarmDescription: `Triggers a scale-in when CPU < ${cpuLowThreshold}%`,
  alarmActions: [scaleDownPolicy.arn],
  tags: {
    Name: `${appName}-cpu-low-alarm`,
    BillingId: billingId
  }
});

// HTTPS CONFIGURATION (OPTIONAL) *********************************************************************************

if (httpsEnabled && domainName) {
  // Certificate
  const certificate = new aws.acm.Certificate(`${appName}-certificate`, {
    domainName: domainName,
    validationMethod: "DNS",
    tags: {
      Name: `${appName}-certificate`,
      BillingId: billingId
    },
  });

  // Route 53 Record
  const zone = new aws.route53.Zone(`${appName}-dns-zone`, {
    name: domainName,
    tags: {
      Name: `${appName}-dns-zone`,
      BillingId: billingId
    }
  });

  const validationRecord = new aws.route53.Record(`${appName}-validation-record`, {
    name: certificate.domainValidationOptions[0].resourceRecordName,
    zoneId: zone.id,
    type: certificate.domainValidationOptions[0].resourceRecordType,
    records: [certificate.domainValidationOptions[0].resourceRecordValue],
    ttl: 60,
  });

  // Validate the ACM certificate
  const validation = new aws.acm.CertificateValidation(`${appName}-validation`, {
    certificateArn: certificate.arn,
    validationRecordFqdns: [validationRecord.fqdn],
  });

  // Route 53 Record for the Load Balancer
  new aws.route53.Record(`${appName}-lb-record`, {
    name: domainName,
    zoneId: zone.id,
    type: "A",
    aliases: [
      {
        name: lb.dnsName,
        zoneId: lb.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  });

  // HTTPS Listener
  new aws.lb.Listener(`${appName}-https-listener`, {
    loadBalancerArn: lb.arn,
    port: 443,
    certificateArn: certificate.arn,
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: tg.arn,
      },
    ],
    tags: {
      Name: `${appName}-https-listener`,
      BillingId: billingId
    }
  }, { dependsOn: validation });
}

// ********************************************************************************************************************

// Exports
export const LoadBalancerDNSName = lb.dnsName;
