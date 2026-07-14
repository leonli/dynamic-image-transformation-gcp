# Storyline Run — 场景演练手册

> 方案:**Dynamic Image Transformation for Google Cloud CDN**(AWS DIT 无缝迁移对标版)
> 环境:`helloworld-334009` / asia-southeast1,已部署完成、e2e 全绿(2026-07-14)
> 端点:`https://img.googledemo.com`(DNS A 记录生效前,可用 `http://136.69.37.19` 等价演练)

```bash
# 演练前设一个变量,DNS 生效前用 IP,生效后换域名
export DIT="http://136.69.37.19"        # 之后: export DIT="https://img.googledemo.com"
```

源桶 `helloworld-334009-dit-source` 已备好测试数据:
`landscape.jpg`(1200×800 风景)、`portrait.jpg`(960×1199 真人肖像)、`logo.png`(带透明水印)、`solid.png`、`animated.gif`(3 帧)、`e2e/test.jpg`。

---

## 场景 1|AWS 客户的老 URL 直接能跑(Thumbor 兼容)

客户从 CloudFront 迁来,他们应用里拼的是 Thumbor 风格路径——不改一行代码:

```bash
# 老 URL 原样工作:等比缩到 300x200 盒内
curl -o out1.jpg "$DIT/fit-in/300x200/landscape.jpg"

# 老 URL 里的 s3: 桶前缀也原样兼容(自动识别,同时支持 gs:)
curl -o out1b.jpg "$DIT/fit-in/300x200/s3:helloworld-334009-dit-source/landscape.jpg"

# filter 链:转 webp + 质量 60 + 灰度
curl -o out1c.webp "$DIT/filters:format(webp)/filters:quality(60)/filters:grayscale()/landscape.jpg"
```

**看点**:返回头 `Content-Type` 随格式变化;`Cache-Control: max-age=31536000,public` 与 AWS 默认一致。迁移时若 GCS 桶名与原 S3 桶名不同,环境变量 `BUCKET_MAP=旧S3名=新GCS名` 可让老 URL 里的旧桶名继续工作。

## 场景 2|base64 JSON 请求(DEFAULT 格式)+ Demo UI

AWS SDK 客户端拼的 base64 请求,格式完全一致:

```bash
# {"bucket":"helloworld-334009-dit-source","key":"landscape.jpg","edits":{"resize":{"width":400}}}
curl -o out2.jpg "$DIT/eyJidWNrZXQiOiJoZWxsb3dvcmxkLTMzNDAwOS1kaXQtc291cmNlIiwia2V5IjoibGFuZHNjYXBlLmpwZyIsImVkaXRzIjp7InJlc2l6ZSI6eyJ3aWR0aCI6NDAwfX19"
```

图形化演示走 **Demo UI**:浏览器打开 `$DIT/demo/index.html`,填 bucket/key → Import → 调参 → Preview,页面会同时给出 JSON 请求体和编码后的 URL(可直接复制给开发)。

## 场景 3|Auto-WebP + CDN 缓存命中

```bash
# 同一 URL,带 webp Accept 头 → 自动转 webp(省 25-35% 带宽)
curl -sI -H "Accept: image/webp" "$DIT/fit-in/500x500/landscape.jpg" | grep -iE "content-type|vary"
#   Content-Type: image/webp   Vary: Accept

# 不支持 webp 的老客户端 → 原格式
curl -sI -H "Accept: image/jpeg" "$DIT/fit-in/500x500/landscape.jpg" | grep -i content-type

# 连打两次看 CDN:第二次响应带 Age 头 = 边缘缓存命中,不再回源计算
curl -sI "$DIT/fit-in/500x500/landscape.jpg" | grep -iE "^age|cache-control"
curl -sI "$DIT/fit-in/500x500/landscape.jpg" | grep -iE "^age|cache-control"
```

**看点**:两种 Accept 各自独立缓存(`Vary: Accept`),对标 CloudFront 缓存键含 Accept 的行为。

## 场景 4|水印(overlayWith)

logo 缩放到底图 30% 宽、70% 透明、贴右下角(负百分比 = 从右/下缘定位):

```bash
# edits.overlayWith: logo.png, alpha 30, wRatio 30, left/top = -5p
curl -o out4.jpg "$DIT/eyJidWNrZXQiOiJoZWxsb3dvcmxkLTMzNDAwOS1kaXQtc291cmNlIiwia2V5IjoibGFuZHNjYXBlLmpwZyIsImVkaXRzIjp7InJlc2l6ZSI6eyJ3aWR0aCI6NjAwfSwib3ZlcmxheVdpdGgiOnsiYnVja2V0IjoiaGVsbG93b3JsZC0zMzQwMDktZGl0LXNvdXJjZSIsImtleSI6ImxvZ28ucG5nIiwiYWxwaGEiOiIzMCIsIndSYXRpbyI6MzAsIm9wdGlvbnMiOnsibGVmdCI6Ii01cCIsInRvcCI6Ii01cCJ9fX19"

# Thumbor 老写法等价:
curl -o out4b.jpg "$DIT/filters:watermark(helloworld-334009-dit-source,logo.png,-5p,-5p,30,30,30)/landscape.jpg"
```

## 场景 5|智能裁剪(smartCrop,Cloud Vision 对标 Rekognition)

```bash
# 人脸检测裁剪,padding 10px → 得到 360x415 的人脸特写
curl -o out5.jpg "$DIT/filters:smart_crop(0,10)/portrait.jpg"

# 教学点:padding 过大越过图片边界 → 与 AWS 相同的 400 错误
curl -s "$DIT/filters:smart_crop(0,600)/portrait.jpg" | python3 -m json.tool
#   {"status":400, "code":"SmartCrop::PaddingOutOfBounds", ...}
```

**注意**:Vision 只认真实人脸照片,画作(如蒙娜丽莎)不会命中——桶里两张图可对比演示"检测到→裁剪 / 未检测到→原图返回"。

## 场景 6|内容审核(contentModeration,SafeSearch)

```bash
# 干净图片:审核通过,原样处理(不模糊)
curl -o out6.jpg "$DIT/eyJidWNrZXQiOiJoZWxsb3dvcmxkLTMzNDAwOS1kaXQtc291cmNlIiwia2V5IjoicG9ydHJhaXQuanBnIiwiZWRpdHMiOnsiY29udGVudE1vZGVyYXRpb24iOnsibWluQ29uZmlkZW5jZSI6NzUsImJsdXIiOjUwfX19"
```

命中违规内容时自动 `blur(50)`;`moderationLabels` 支持 Rekognition 老标签名(如 `"Explicit Nudity"`)自动映射到 Vision 类别,迁移客户的审核配置不用改。

## 场景 7|请求签名(HMAC-SHA256,防盗链)

开关一条命令(约 1 分钟生效):

```bash
cd ~/dynamic-image-transformation-gcp/infra/terraform
terraform apply -auto-approve -var-file=example.tfvars \
  -var "image=asia-southeast1-docker.pkg.dev/helloworld-334009/dit/image-handler:v1.0.2" \
  -var "enable_signature=Yes"
```

签名与验证(算法与 AWS 逐字节一致,客户端签名代码零改动):

```bash
KEY=$(gcloud secrets versions access latest --secret dit-signature-secret | python3 -c "import sys,json;print(json.load(sys.stdin)['signatureKey'])")
PATH_TO_SIGN="/fit-in/300x300/landscape.jpg"
SIG=$(echo -n "$PATH_TO_SIGN" | openssl dgst -sha256 -hmac "$KEY" -hex | awk '{print $NF}')

curl -s "$DIT$PATH_TO_SIGN?signature=deadbeef" | python3 -m json.tool   # 403 SignatureDoesNotMatch
curl -o ok.jpg "$DIT$PATH_TO_SIGN?signature=$SIG"                      # 200 ✓
```

演练完把 `-var enable_signature=Yes` 去掉再 apply 一次即恢复(当前部署已恢复为 No)。

## 场景 8|错误处理与限时链接

```bash
# 404:错误 JSON 与 AWS 逐字段一致,且 CDN 只缓存 10 秒(Cache-Control: max-age=10)
curl -s "$DIT/no-such-image.jpg" | python3 -m json.tool

# 限时 URL:过期时间一到立即失效(格式 YYYYMMDDTHHmmssZ)
curl -s "$DIT/fit-in/100x100/landscape.jpg?expires=20200101T000000Z" | python3 -m json.tool
#   {"status":400, "code":"ImageRequestExpired", ...}

# 动图:GIF 保帧处理,resize 不丢动画
curl -o out8.gif "$DIT/fit-in/100x100/animated.gif"
```

## 场景 9|给客户翻阅的文档站

- 实施指南(中英双语,Google 文档风格):`$DIT/docs/index.html`(自动按浏览器语言跳转 en/zh)
- 重点页:**Thumbor 兼容与迁移**(`/docs/zh/thumbor.html`)、**API 参考**(`/docs/zh/api-reference.html`)、**部署指南**(两种方式,`/docs/zh/deploy.html`)

## 附|运维速查

| 操作 | 命令 |
|---|---|
| 单元测试(299 例) | `deployment/run-unit-tests.sh` |
| e2e(线上) | `BASE_URL=$DIT deployment/run-e2e-tests.sh` |
| 发新版本 | `deployment/build-and-deploy.sh --tag vX.Y.Z` |
| 向导式部署/卸载 | `infra/launch-wizard/launch-wizard.sh [--destroy]` |
| 看服务日志 | `gcloud run services logs read dit-image-handler --region asia-southeast1` |
| 全量卸载 | `cd infra/terraform && terraform destroy -var-file=example.tfvars` |

**待办一件事**:在 googledemo.com 的 DNS 加 A 记录 `img → 136.69.37.19`,托管证书随后自动签发(15-60 分钟),HTTPS 即通。
