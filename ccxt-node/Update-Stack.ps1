param (
    [String]
    $VpcId = "",
    [String]
    $AwsProfile = "busyweb-admin",
    [String]
    $Region = "af-south-1"
)

if ([string]::IsNullOrEmpty($AwsProfile)) {
    $AwsProfile = $Env:AWS_PROFILE
}

if ([string]::IsNullOrEmpty($AwsProfile)) {
    $AwsProfile = "default"
}

if ([string]::IsNullOrEmpty($VpcId)) {
    $VpcId = $(ConvertFrom-Json([string]::Join("", $(aws ec2 describe-vpcs --query "Vpcs[].VpcId" --region $Region --profile $AwsProfile))))[0]
}

$SubnetId = $(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VpcId --query "Subnets[0].SubnetId" --region $Region --profile $AwsProfile)

aws cloudformation deploy `
    --template-file .\cfn\cloud-formation.yaml `
    --stack-name "ccxt-node-stack" `
    --profile $AwsProfile `
    --region $Region `
    --parameter-overrides `
        VPCId=$VpcId `
        KeyPair="auto-invest" `
        SubnetId=$SubnetId `
    --capabilities CAPABILITY_NAMED_IAM 