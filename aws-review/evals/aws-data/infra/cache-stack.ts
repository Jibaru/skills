import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import type { Construct } from "constructs";

export interface CacheStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSecurityGroup: ec2.ISecurityGroup;
  userGroupId: string;
}

export class CacheStack extends Stack {
  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props);

    const sg = new ec2.SecurityGroup(this, "CacheSg", { vpc: props.vpc, allowAllOutbound: false });
    sg.addIngressRule(props.appSecurityGroup, ec2.Port.tcp(6379), "app to cache");

    const subnets = new elasticache.CfnSubnetGroup(this, "CacheSubnets", {
      description: "profile cache subnets",
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
    });

    const cache = new elasticache.CfnReplicationGroup(this, "ProfileCache", {
      replicationGroupDescription: "user profile cache",
      engine: "valkey",
      engineVersion: "8.1",
      cacheNodeType: "cache.r7g.large",
      clusterMode: "enabled",
      numNodeGroups: 2,
      replicasPerNodeGroup: 1,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      atRestEncryptionEnabled: true,
      cacheParameterGroupName: "default.valkey8.cluster.on",
      cacheSubnetGroupName: subnets.ref,
      securityGroupIds: [sg.securityGroupId],
      userGroupIds: [props.userGroupId],
    });

    new CfnOutput(this, "CacheEndpoint", { value: cache.attrConfigurationEndPointAddress });
  }
}
