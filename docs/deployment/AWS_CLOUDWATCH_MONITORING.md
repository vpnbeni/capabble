# AWS CloudWatch Monitoring Setup

Alerting for the Capabble EC2 server: instance crashes, high CPU, high memory, low disk. Written so this can be recreated from scratch on a **new AWS account** (current instance's free tier is expiring and it'll be migrated).

Everything below assumes:
- EC2 instance running Ubuntu 24.04, backend processes managed by PM2 (`capabble-server`, `capabble-stage`, and other apps sharing the box).
- AWS CLI available either via **CloudShell** (browser, no local setup) or a local terminal with `aws configure` done.
- Replace `ACCOUNT_ID`, `REGION`, `IID` (instance ID), `HOST` (instance hostname) with the new account's actual values throughout.

## 1. Create an SNS topic for alerts

```bash
aws sns create-topic --name server-alerts
# copy the TopicArn from the output, e.g. arn:aws:sns:ap-south-1:ACCOUNT_ID:server-alerts

aws sns subscribe \
  --topic-arn arn:aws:sns:REGION:ACCOUNT_ID:server-alerts \
  --protocol email \
  --notification-endpoint vpnbeniwal123@gmail.com
```

Confirm the subscription via the email AWS sends ("AWS Notification - Subscription Confirmation") — alarms won't deliver until this is confirmed. Verify with:
```bash
aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:REGION:ACCOUNT_ID:server-alerts
```
`SubscriptionArn` should be a real ARN, not `PendingConfirmation`.

## 2. Attach an IAM role to the EC2 instance (needed for memory/disk metrics)

1. IAM console → Roles → **Create role** → Trusted entity: **AWS service** → Use case: **EC2**.
2. Attach policy: **`CloudWatchAgentServerPolicy`**.
3. Name it `capabble-ec2-cloudwatch-role` → Create.
4. EC2 console → Instances → select instance → **Actions → Security → Modify IAM role** → select `capabble-ec2-cloudwatch-role` → Update IAM role.

Note: only default (system/instance) status check and CPU/network/disk-I/O metrics are free/automatic on EC2. **Memory and disk-space-used are NOT reported by default** — that's what the CloudWatch Agent below is for.

## 3. Connect to the instance

If you don't have the `.pem` key file, use **EC2 Instance Connect** instead of SSH:
EC2 console → Instances → select instance → **Connect** → "EC2 Instance Connect" tab → Connect (opens a browser terminal, no key needed — requires the instance to have a public IP and security group allowing port 22).

## 4. Install the CloudWatch Agent

Ubuntu does **not** have `amazon-cloudwatch-agent` in its default apt repos (unlike Amazon Linux) — download the `.deb` directly:

```bash
wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb
dpkg -l | grep amazon-cloudwatch-agent   # confirm install
```

Create the config:
```bash
sudo tee /opt/aws/amazon-cloudwatch-agent/etc/config.json > /dev/null <<'EOF'
{
  "metrics": {
    "namespace": "CustomEC2Metrics",
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 60 },
      "disk": { "measurement": ["used_percent"], "resources": ["/"], "metrics_collection_interval": 60 }
    }
  }
}
EOF
```

Start it:
```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
```
Should report `"status": "running"`. If the CloudWatch Agent metrics don't show up after a few minutes, check `sudo tail -50 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log` for `AccessDenied` (missing IAM role) or region-detection errors.

**Important gotcha:** the agent tags published metrics with dimension `host=<hostname>` (e.g. `ip-172-31-40-105`), **not** `InstanceId`. Also disk metric name is `disk_used_percent`, not `used_percent`. Confirm actual dimension values before writing alarms:
```bash
aws cloudwatch list-metrics --namespace CustomEC2Metrics
```
Use the exact `device`/`fstype`/`host` values returned (e.g. `nvme0n1p1` on Nitro-based instances, `xvda1` on older ones) — don't assume.

## 5. Create the alarms

Back in CloudShell (or wherever the AWS CLI is authenticated):

```bash
TOPIC=arn:aws:sns:REGION:ACCOUNT_ID:server-alerts
IID=i-xxxxxxxxxxxxxxxxx        # instance ID
HOST=ip-xxx-xxx-xxx-xxx        # from list-metrics output above
REGION=ap-south-1              # or your region

# Hardware/hypervisor failure -> notify + auto-recover instance on new hardware
aws cloudwatch put-metric-alarm \
  --alarm-name "capabble-status-check-failed" \
  --namespace AWS/EC2 --metric-name StatusCheckFailed_System \
  --dimensions Name=InstanceId,Value=$IID \
  --statistic Maximum --period 60 --evaluation-periods 3 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions $TOPIC arn:aws:automate:$REGION:ec2:recover
# Note: auto-recover action ONLY works with StatusCheckFailed_System, not the combined StatusCheckFailed metric.

# OS-level failure -> notify only (auto-recover can't fix this)
aws cloudwatch put-metric-alarm \
  --alarm-name "capabble-instance-check-failed" \
  --namespace AWS/EC2 --metric-name StatusCheckFailed_Instance \
  --dimensions Name=InstanceId,Value=$IID \
  --statistic Maximum --period 60 --evaluation-periods 3 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions $TOPIC

# High CPU
aws cloudwatch put-metric-alarm \
  --alarm-name "capabble-high-cpu" \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=$IID \
  --statistic Average --period 300 --evaluation-periods 3 \
  --threshold 80 --comparison-operator GreaterThanThreshold \
  --alarm-actions $TOPIC

# High memory (requires CloudWatch Agent from step 4)
aws cloudwatch put-metric-alarm \
  --alarm-name "capabble-high-memory" \
  --namespace CustomEC2Metrics --metric-name mem_used_percent \
  --dimensions Name=host,Value=$HOST \
  --statistic Average --period 300 --evaluation-periods 3 \
  --threshold 85 --comparison-operator GreaterThanThreshold \
  --alarm-actions $TOPIC

# Low disk space (requires CloudWatch Agent from step 4; adjust device/fstype from list-metrics output)
aws cloudwatch put-metric-alarm \
  --alarm-name "capabble-low-disk" \
  --namespace CustomEC2Metrics --metric-name disk_used_percent \
  --dimensions Name=host,Value=$HOST Name=path,Value=/ Name=device,Value=nvme0n1p1 Name=fstype,Value=ext4 \
  --statistic Average --period 300 --evaluation-periods 1 \
  --threshold 85 --comparison-operator GreaterThanThreshold \
  --alarm-actions $TOPIC
```

Verify:
```bash
aws cloudwatch describe-alarms \
  --alarm-names capabble-status-check-failed capabble-instance-check-failed capabble-high-cpu capabble-high-memory capabble-low-disk \
  --query "MetricAlarms[].{Name:AlarmName,State:StateValue}" --output table
```
`INSUFFICIENT_DATA` is normal for the first ~15 minutes; it resolves to `OK` once enough data points land.

## 6. Create the dashboard

```bash
cat > dashboard.json <<EOF
{
  "widgets": [
    {
      "type": "metric", "x": 0, "y": 0, "width": 8, "height": 6,
      "properties": {
        "title": "CPU Utilization",
        "metrics": [["AWS/EC2", "CPUUtilization", "InstanceId", "$IID"]],
        "period": 300, "stat": "Average", "region": "$REGION", "view": "timeSeries"
      }
    },
    {
      "type": "metric", "x": 8, "y": 0, "width": 8, "height": 6,
      "properties": {
        "title": "Memory Used %",
        "metrics": [["CustomEC2Metrics", "mem_used_percent", "host", "$HOST"]],
        "period": 300, "stat": "Average", "region": "$REGION", "view": "timeSeries"
      }
    },
    {
      "type": "metric", "x": 16, "y": 0, "width": 8, "height": 6,
      "properties": {
        "title": "Disk Used % (/)",
        "metrics": [["CustomEC2Metrics", "disk_used_percent", "path", "/", "host", "$HOST", "device", "nvme0n1p1", "fstype", "ext4"]],
        "period": 300, "stat": "Average", "region": "$REGION", "view": "timeSeries"
      }
    },
    {
      "type": "metric", "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Status Checks",
        "metrics": [
          ["AWS/EC2", "StatusCheckFailed_System", "InstanceId", "$IID"],
          ["AWS/EC2", "StatusCheckFailed_Instance", "InstanceId", "$IID"]
        ],
        "period": 60, "stat": "Maximum", "region": "$REGION", "view": "timeSeries"
      }
    },
    {
      "type": "alarm", "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Alarm Status",
        "alarms": [
          "arn:aws:cloudwatch:$REGION:ACCOUNT_ID:alarm:capabble-status-check-failed",
          "arn:aws:cloudwatch:$REGION:ACCOUNT_ID:alarm:capabble-instance-check-failed",
          "arn:aws:cloudwatch:$REGION:ACCOUNT_ID:alarm:capabble-high-cpu",
          "arn:aws:cloudwatch:$REGION:ACCOUNT_ID:alarm:capabble-high-memory",
          "arn:aws:cloudwatch:$REGION:ACCOUNT_ID:alarm:capabble-low-disk"
        ]
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard --dashboard-name "Capabble-Server-Monitoring" --dashboard-body file://dashboard.json
```

View at: CloudWatch console → Dashboards → **Capabble-Server-Monitoring**.

## 7. Optional billing alarm (unrelated to server health, but standard hygiene — especially relevant once off free tier)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "billing-over-budget" \
  --namespace AWS/Billing --metric-name EstimatedCharges \
  --dimensions Name=Currency,Value=USD \
  --statistic Maximum --period 21600 --evaluation-periods 1 \
  --threshold 50 --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:server-alerts \
  --region us-east-1
```
Billing metrics/alarms only exist in `us-east-1` regardless of your instance's region — you'll need a separate SNS topic + subscription there too (billing metric data must also be enabled once, under Billing Preferences → "Receive CloudWatch Billing Alerts").

## Known gaps (not yet covered)

- **App-level crash detection**: none of the above catches a Node process dying while the OS/instance stays healthy. PM2 is already managing the processes (`pm2 status` shows `capabble-server`, `capabble-stage`, `amoura-server`, `capabble-api`) and will auto-restart on crash, but there's no alarm on restart *count*. To add: use `pm2-logrotate` + a CloudWatch Logs metric filter on error patterns (`uncaughtException`, `FATAL`), or push a custom PM2 restart-count metric.
- **Multiple apps share this instance.** CPU/memory thresholds (80%/85%) apply to the whole box, not just Capabble — check `pm2 status` to identify the actual offender when an alarm fires.
- **Alarms are tied to this specific instance ID and hostname.** If the instance is stopped/started (private IP/hostname changes) or replaced, the memory/disk alarms (keyed on `host=`) will silently stop receiving data and need to be recreated. The CPU/status-check alarms (keyed on `InstanceId=`) survive stop/start but not termination+relaunch.
