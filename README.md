# AWS Infrastructure with Auto Scaling, S3, and Load Balancer using Pulumi

This Pulumi program creates a basic AWS infrastructure including:

- VPC (Virtual Private Cloud) with subnets.
- S3 Bucket for object storage.
- EC2 Instances using Auto Scaling with dynamic scaling policies based on CPU utilization.
- Elastic Load Balancer (ELB) with public access.
- IAM Roles to allow EC2 instances access to the S3 bucket.
- CloudWatch Alarms to trigger scaling actions for the Auto Scaling Group (ASG) when CPU usage crosses thresholds.
- Optionally, the program also includes configuration for HTTPS using an ACM certificate and Route 53.

## Prerequisites

1. Install Pulumi CLI.
2. Install AWS CLI and configure your credentials:

    ```bash
    aws configure
    ```

3. Create an SSH key pair in your AWS account to allow SSH access to EC2 instances:

    ```bash
    aws ec2 create-key-pair --key-name my-keypair --query "KeyMaterial" --output text > ~/.ssh/my-keypair.pem
    chmod 400 ~/.ssh/my-keypair.pem
    ```

## Configuration

This Pulumi program uses Pulumi configuration settings to define various parameters. Set the following values before deploying:

```bash
pulumi config set aws:region us-west-2                   # AWS region
pulumi config set appName my-app                         # Application name
pulumi config set billingId 123456                       # Billing ID tag
pulumi config set bucketName my-app-bucket-123456        # S3 bucket name
pulumi config set instanceType t2.micro                  # EC2 instance type 
pulumi config set sshKeyPairName my-keypair              # SSH key pair name (replace with your key)
pulumi config set domainName example.com                 # Domain name for HTTPS
pulumi config set asgMinSize 1                           # Min instances in the Auto Scaling Group
pulumi config set asgMaxSize 5                           # Max instances in the Auto Scaling Group
pulumi config set asgDesiredCapacity 2                   # Desired number of instances
pulumi config set cpuHighThreshold 80                    # CPU threshold for scaling out
pulumi config set cpuLowThreshold 20                     # CPU threshold for scaling in
```

## Deployment

Once the configuration is set up, deploy the stack by running the following commands:

1. **Initialize Pulumi**

    If this is your first time using Pulumi, initialize your Pulumi stack:

    ```bash
    pulumi stack init dev
    ```

2. **Preview the deployment**

    You can preview what resources will be created with the following command:

    ```bash
    pulumi preview
    ```

3. **Deploy the infrastructure**

    To deploy the infrastructure to AWS:

    ```bash
    pulumi up
    ```

    This command will prompt you to confirm before creating the resources. Type "yes" to proceed.

4. **Access the Load Balancer**

    Once the deployment is complete, Pulumi will output the DNS name of your Load Balancer:

    ```bash
    LoadBalancerDNSName: "my-app-lb-123456.elb.amazonaws.com"
    ```

    You can access your EC2 instances behind the Load Balancer by opening this URL in a browser.

## SSH Access to EC2 Instances

To SSH into your EC2 instances, use the key pair specified in the configuration:

```bash
ssh -i ~/.ssh/my-keypair.pem ec2-user@<ec2-instance-public-ip>
```

## Auto Scaling Based on CPU Utilization

The Auto Scaling Group will automatically add instances when CPU utilization exceeds 80% and scale in when it drops below 20%. You can modify these thresholds in the configuration:

- `cpuHighThreshold`: Set the CPU usage to trigger a scale-out action.
- `cpuLowThreshold`: Set the CPU usage to trigger a scale-in action.

## Optional: Enabling HTTPS

You can configure your Load Balancer to use HTTPS by enabling the commented section in the Pulumi program. It provisions an ACM certificate and sets up Route 53 DNS records to serve traffic over HTTPS.

### Steps for enabling HTTPS

1. Uncomment the HTTPS CONFIGURATION section in the Pulumi program.
2. Configure a domain name with Pulumi:

    ```bash
    pulumi config set domainName your-domain.com
    ```

3. Ensure your domain is managed in Route 53 or update your DNS settings accordingly.
4. Deploy HTTPS:

  ```bash
  pulumi up
  ```

  Once deployed, you will have a secure Load Balancer that serves traffic over HTTPS.

## Cleanup

To destroy the resources and avoid incurring additional AWS charges:

```bash
pulumi destroy
```

You can also remove the stack if it's no longer needed:

```bash
pulumi stack rm dev
```

## Further Documentation

- [Pulumi AWS Documentation](https://www.pulumi.com/docs/intro/cloud-providers/aws/)
- [AWS Auto Scaling](https://docs.aws.amazon.com/autoscaling/)
- [AWS Elastic Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/)
- [AWS S3](https://docs.aws.amazon.com/s3/)

This README provides all the necessary information to deploy the provided infrastructure. For more advanced use-cases or customizations, refer to the Pulumi and AWS documentation.
