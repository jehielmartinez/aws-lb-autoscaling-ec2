from diagrams import Diagram, Cluster
from diagrams.aws.network import VPC, ELB
from diagrams.aws.compute import EC2, AutoScaling
from diagrams.aws.storage import S3
from diagrams.aws.network import InternetGateway
from diagrams.onprem.client import Users

# Define the diagram context
with Diagram("Load Balanced EC2 Autoscaling Application", show=True):
    users = Users("Users")
    with Cluster("VPC 10.0.0.0/16"):
        vpc = VPC("VPC")
        internet_gateway = InternetGateway("Internet Gateway")
        
        with Cluster("Public Subnet"):
          load_balancer = ELB("Load Balancer")
        
        with Cluster("Availability Zone 1"):
            with Cluster("Private Subnet 1"):
                ec2_instance1 = EC2("EC2 Instance 1")
        
        with Cluster("Availability Zone 2"):
            with Cluster("Private Subnet 2"):
                ec2_instance2 = EC2("EC2 Instance 2")
        
        asg = AutoScaling("Auto Scaling Group")
        load_balancer >> asg >> [ec2_instance1, ec2_instance2]
                
    # s3_bucket = S3("S3 Bucket")

    # Define the connections between the components
    users >> internet_gateway >> load_balancer
    # s3_bucket << [ec2_instance1, ec2_instance2]


