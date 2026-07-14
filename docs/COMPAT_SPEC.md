# AWS DIT v7 兼容性规格(内部权威文档)

> 本文件是 GCP 实现的**兼容性准绳**,内容来自对 `aws-solutions/dynamic-image-transformation-for-amazon-cloudfront` main 分支源码的逐文件核对。实现与测试以本文为准;与客户文档冲突时以本文为准。

## 1. 请求类型判定(顺序敏感)

枚举 `RequestTypes = { DEFAULT: "Default", CUSTOM: "Custom", THUMBOR: "Thumbor" }`:

1. path 匹配 base64 正则 `/^(\/?)([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/` **且**能 base64→JSON 解析 → `DEFAULT`
2. 否则 `REWRITE_MATCH_PATTERN` 与 `REWRITE_SUBSTITUTION` 均非空 → `CUSTOM`
3. 否则 path 无扩展名,或以 `.jpg/.jpeg/.png/.webp/.tiff/.tif/.svg/.gif/.avif` 结尾 → `THUMBOR`
4. 否则 400 `RequestTypeError`

## 2. DEFAULT 请求

- URL = `/<base64(JSON.stringify(request))>`;解码失败 → 400 `DecodeRequest::CannotDecodeRequest`;空 path → 400 `DecodeRequest::CannotReadPath`
- JSON schema:

```ts
{
  bucket?: string;   // 必须在 SOURCE_BUCKETS 白名单,否则 403 ImageBucket::CannotAccessBucket;缺省=白名单第一个
  key: string;
  edits?: ImageEdits;
  outputFormat?: "jpg"|"jpeg"|"png"|"webp"|"tiff"|"heif"|"heic"|"raw"|"gif"|"avif";
  effort?: number;   // 仅 webp;Math.trunc 后 0–6,否则默认 4
  headers?: Record<string,string>;  // 经 HEADER_DENY_LIST 过滤
}
```

## 3. THUMBOR 路径

`/[fit-in/][AxB:CxD/][WxH/][filters:f1(v):f2(v)/]key`

- crop:`AxB:CxD` → `crop:{left:A,top:B,width:C-A,height:D-B}`(正则 `\d{1,6}x\d{1,6}:\d{1,6}x\d{1,6}`)
- resize:第一个 `/(\d+x\d+)|(0x\d+)/` 匹配;`0` 维 → null + `fit=inside`;`fit-in` → `fit=inside`
- filters 拆出后**按字母序排序**再应用(保证 format 先于 quality)
- key 提取:依次去掉 crop 段、WxH 段、`filters:watermark(...)`、`filters:[^/]+`、`/fit-in/`、`s3:<bucket>/`(GCP 版同时支持 `gs:<bucket>/`)、前导 `/`,再 `decodeURIComponent`
- `s3:<bucket>/` 或 `gs:<bucket>/` 段:bucket 在白名单内则覆盖默认桶,否则忽略

### filters 全表(20 个)

| filter | 映射 |
|---|---|
| `autojpg()` | `toFormat:"jpeg"` |
| `background_color(c)` | `flatten:{background:Color}`(非 CSS 名加 `#` 解析) |
| `blur(r[,s])` | `blur: s ?? r/2` |
| `convolution(m,w)` | `convolve:{width:w,height:ceil(len/w),kernel}`(m 用 `;` 分隔) |
| `equalize()` | `normalize:true` |
| `fill(c)` | `resize.fit="contain"; resize.background=Color` |
| `format(f)` | `toFormat`(heic/heif/jpeg/png/raw/tiff/webp/gif/avif;jpg→jpeg) |
| `grayscale()` | `grayscale:true` |
| `no_upscale()` | `resize.withoutEnlargement:true` |
| `proportion(r)` | 已有 w&h 则乘 r;否则 `resize.ratio=r`(applyResize 时乘 metadata) |
| `quality(q)` | `edits[<fmt>]={quality:q}`,fmt 取 URL 扩展名否则 toFormat;jpg→jpeg |
| `rgb(r,g,b)` | `tint:{r,g,b}`,入参百分比 → `255*(pct/100)` |
| `rotate(d)` | `rotate:d`;空参 → `rotate:undefined`(sharp autoOrient) |
| `sharpen(a,b[,c])` | `sharpen: 1 + b/2` |
| `stretch()` | `resize.fit="fill"`(除非已是 inside) |
| `strip_exif()` | 去 EXIF 保 ICC |
| `strip_icc()` | `withIccProfile('srgb')` 保 EXIF |
| `upscale()` | `resize.fit="inside"` |
| `watermark(bucket,key,x,y,alpha[,wR,hR])` | overlayWith;x/y 为数字或 `NNp` 百分比(pattern `/^(100|[1-9]?\d|-(100|[1-9]\d?))p$/`) |
| `animated(b)` | `animated: v.toLowerCase()!=="false"` |
| `smart_crop([i[,p]])` | `smartCrop:{faceIndex:i,padding:p}`(parseInt) |

## 4. query 参数 edits(所有请求类型叠加,覆盖 path edits)

`format→toFormat`、`fit→resize.fit`、`width/height→resize.*`("0"/空→null)、`rotate`(空→null)、`flip/flop`(falsy:`"0"/"false"/""`)、`grayscale|greyscale→greyscale`。解析失败 → 400 `QueryParameterParsingError`。

入口归一化(对标 CloudFront Function):Accept 含 `image/webp` → 改写为 `image/webp`,否则空;query 仅保留 `['signature','expires','format','fit','width','height','rotate','flip','flop','grayscale']`,多值取最后,按 key 排序。

## 5. edits 白名单与管线

sharp 直通:
- CHANNEL: removeAlpha, ensureAlpha, extractChannel, joinChannel, bandbool
- COLOR: tint, greyscale, grayscale, pipelineColourspace, pipelineColorspace, toColourspace, toColorspace
- OPERATION: rotate, flip, flop, affine, sharpen, median, blur, flatten, unflatten, gamma, negate, normalise, normalize, clahe, convolve, threshold, boolean, linear, recomb, modulate
- FORMAT: jpeg, png, webp, gif, avif, tiff, heif, toFormat
- RESIZE: resize, extend, extract, trim

特殊:overlayWith, smartCrop, roundCrop, contentModeration, crop, animated。

顺序:先 applyResize,再按 edits 键序。要点:
- resize 缺省注入 `{fit:"inside"}`;w/h Math.round,≤0 → 400 `InvalidResizeException`;ratio 乘尺寸后删除
- crop=extract,越界 → 400 `Crop::AreaOutOfBounds`
- roundCrop:默认 rx=ry=min(w,h)/2, top=h/2, left=w/2;SVG ellipse dest-in composite 后 trim
- overlayWith `{bucket,key,alpha(0-100,越界→0),wRatio,hRatio,options:{left,top}}`;负值从右/下缘减;`NNp` 百分比;失败 → 400 `OverlayImageException`
- animated:显式 edits.animated 否则 contentType==image/gif;pages<=1 回落;动图跳过 rotate/smartCrop/roundCrop/contentModeration
- 无 edits 且无 outputFormat:原图直返(不经 sharp)
- 默认 keepIccProfile().keepMetadata();sharp 选项 `{failOnError:false, animated, limitInputPixels: SHARP_SIZE_LIMIT||默认}`
- outputFormat=webp 且有 effort → `webp({effort})`;SVG 有 edits 无 toFormat → 强制 PNG
- fixQuality(仅 Thumbor/Custom):质量 key 与最终格式不一致时迁移

## 6. 签名与 expires

- `ENABLE_SIGNATURE=Yes`:缺 `?signature=` → 400 `AuthorizationQueryParametersError`("Query-string requires the signature parameter.")
- 待签串:`stringToSign = path` + (非空时 `"?"+排序后query`);query = 除 signature 外的 `key=value` 按 key sort 后 `&` 连接;path 含前导 `/`
- `createHmac("sha256", secretJson[SECRET_KEY]).update(stringToSign).digest("hex")`;不匹配 → 403 `SignatureDoesNotMatch`;其他异常 → 500 `SignatureValidationFailure`
- `?expires=YYYYMMDDTHHmmssZ`(UTC strict):格式错 → 400 `ImageRequestExpiryFormat`;过期 → 400 `ImageRequestExpired`;有效 → `Cache-Control: max-age=<秒>,public`

## 7. smartCrop / contentModeration(GCP 用 Vision)

- smartCrop `true | {faceIndex=0, padding=0}`:Vision FACE_DETECTION;bbox 归一化 clamp [0,1];crop = `floor(bb*dim ± padding)` clamp 图内;faceIndex 越界 → 400 `SmartCrop::FaceIndexOutOfRange`;padding 越界 → 400 `SmartCrop::PaddingOutOfBounds`;其他 → 500 `SmartCrop::Error`;无人脸 → 全图不裁;人脸按 bbox 面积降序(GCP 确定性规则)
- contentModeration `true | {minConfidence=75, blur=50, moderationLabels?}`:Vision SAFE_SEARCH;likelihood→分值 VERY_UNLIKELY=0/UNLIKELY=25/POSSIBLE=50/LIKELY=75/VERY_LIKELY=100;类别名 Adult/Violence/Racy/Medical/Spoof(同时接受 Rekognition 别名 "Explicit Nudity"→Adult, "Graphic Violence"→Violence, "Suggestive"→Racy);命中 → blur(ceil(blur)),blur ∈[0.3,1000] 才生效;Vision 调用失败 → 500 `Rekognition::DetectModerationLabelsError`(错误码保留 AWS 名以兼容)

## 8. 错误与 fallback

- 错误 JSON `{"status":n,"code":"...","message":"..."}`;未知 → 500 `{"message":"Internal error. Please contact the system administrator.","code":"InternalError","status":500}`
- GCS 取图失败一律 404 `NoSuchKey`:"The image <key> does not exist or the request may not be base64 encoded properly."
- 413 `TooLargeImageException`(仅 `COMPAT_AWS_LIMITS=Yes` 时,处理后 base64 超 6MB)
- fallback(`ENABLE_DEFAULT_FALLBACK_IMAGE=Yes` + bucket/key 非空):任何处理错误 → 返回 fallback 图,**状态码保留原错误码**;Cache-Control 优先级:fallback 对象自带 → 请求 headers → `max-age=31536000,public`
- 错误响应 `Content-Type: application/json` + CORS 头;Cache-Control 4xx=`max-age=10,public`、5xx=`max-age=600,public`

## 9. 成功响应头

1. `Cache-Control` = 原图对象 CacheControl || `max-age=31536000,public`
2. 叠加自定义 headers(仅 DEFAULT,过 deny list)
3. expires 命中时覆盖 Cache-Control
4. `Access-Control-Allow-Methods: GET`、`Access-Control-Allow-Headers: Content-Type, Authorization`、`Access-Control-Allow-Credentials: true`、CORS_ENABLED=Yes 时 `Access-Control-Allow-Origin: <CORS_ORIGIN>`
5. `Content-Type`:转换时 `image/<fmt>`,否则原图 ContentType;不认识时魔数推断(PNG 89504E47 / WEBP 52494646 / TIFF 49492A00|4D4D002A / GIF 47494638 / JPEG FFD8 / AVIF offset4 6674797061766966),失败 500
6. `Expires`/`Last-Modified` 透传原图对象元数据

AUTO_WEBP=Yes 且 Accept 含 image/webp → 强制 webp;优先级:`edits.toFormat` > AUTO_WEBP > JSON `outputFormat`。

HEADER_DENY_LIST(忽略大小写):精确 `authorization, connection, server, transfer-encoding, referrer-policy, permissions-policy, www-authenticate, proxy-authenticate, x-api-key, set-cookie` + 前缀 `x-frame-*, x-content-*, x-xss-*, strict-transport-*, permissions-*, x-amz-*, x-amzn-*, access-control-*, cross-origin-*, content-*`。

## 10. 环境变量

AWS 同名:`SOURCE_BUCKETS`(必填,逗号分隔,第一个为默认桶)、`CORS_ENABLED`(No)、`CORS_ORIGIN`(*)、`AUTO_WEBP`(No)、`ENABLE_SIGNATURE`(No)、`SECRETS_MANAGER`("",GCP 里为 Secret Manager secret 名)、`SECRET_KEY`("")、`ENABLE_DEFAULT_FALLBACK_IMAGE`(No)、`DEFAULT_FALLBACK_IMAGE_BUCKET/KEY`("")、`REWRITE_MATCH_PATTERN/REWRITE_SUBSTITUTION`("")、`SHARP_SIZE_LIMIT`("")

GCP 新增:`BUCKET_MAP`(""; `s3名=gcs名,...` 迁移别名)、`COMPAT_AWS_LIMITS`(No;Yes 时复刻 6MB→413)、`PORT`(8080)、`GCP_PROJECT`(Vision/Secret 用,缺省 ADC 推断)
