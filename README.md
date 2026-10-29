# 博物館 / hakubutsukan

LAN内のサービスを展示カードから開く、小さなセルフホストポータル。GoでAPI・情報収集・静的画面を配信します。実行時にNode.jsやDBは不要です。フロントエンドの3D描画はThree.js、APIと収集はGoで実装しています。

## 館内プレビュー

トップページは3D展示室です。額装した展示が実際のサービス一覧に対応します。外部CDNや画像サービスへの接続は不要です。

- PC: WASDで歩く、左右の矢印で旋回、ドラッグで見回す
- スマートフォン: 画面の矢印を長押しして移動・旋回、ドラッグで見回す
- 展示をクリック、または館内図や下部の矢印で展示の正面へ移動
- 床をクリックしてその場所へ歩く。「入口へ」で戻る
- 展示の「開く」でサービスへ移動
- 右上の「一覧」で従来の検索・カテゴリ・お気に入り画面へ移動

WebGL 2対応のブラウザが必要です。3Dを描画できない端末でも `/list.html` から一覧を利用できます。動きを減らすOS設定では展示への自動移動を即時切り替えにします。

## MVPでできること

- Dockerラベルで指定したサービスの自動検出（停止中も掲載）
- 名前・紹介文・カテゴリ・展示順・文字や絵文字のアイコン
- 名前・説明の検索、カテゴリ絞り込み、お気に入り（ブラウザ保存）
- 起動状態とDockerヘルスチェックの表示、15秒間隔の自動取得
- 各アプリとDockgeへのリンク
- 接続失敗時の警告と、プロセスが保持する前回データの表示
- モバイル表示、キーボード操作、デモモード

Dockerの「起動中」「正常」はURLへの到達性やログイン可否を示しません。HTTP疎通監視やサービスの起動・停止、ユーザー認証はMVPの対象外です。

## 配置

既存サービスと同じLinux Dockerホストに、独立したComposeスタックとして配置します。Dockgeにもこのスタックを登録できます。Dockge固有の内部APIには依存しません。

```text
LANのブラウザ → Caddy（またはLAN IP:8090）→ hakubutsukan
                                             ↓ 内部ネットワーク
                                           collector → Docker socket

カードをクリック → 既存の各サービスURL
```

`collector`だけがDockerソケットを持ちます。バージョン取得とラベル指定のコンテナ一覧をGETし、名前・紹介・URL・カテゴリ・状態などに絞った情報だけを返します。画面側のAPIからDockerの生データ、環境変数、ログ、操作APIは公開しません。Composeの`collection`ネットワークは内部用で、collectorに公開ポートはありません。

Dockerソケット自体は強い権限を持ちます。`:ro`はAPIを読み取り専用にするものではありません。この実装がGETだけを呼ぶ構成です。ブラウザに見せたくない情報は展示用ラベルに書かないでください。

## 起動

必要なもの: Linux、Docker Engine、Docker Compose v2。実行時の外部サービスやGoインストールは不要です。初回ビルドはGo公式イメージをダウンロードします。

```sh
cp .env.example .env
stat -c '%g' /var/run/docker.sock
# 表示された数値を .env の DOCKER_GID に設定
docker compose up -d --build
```

同じホストから `http://127.0.0.1:8090` で開けます。LANの別端末から直接開く場合は、`.env`の`BIND_ADDRESS`をサーバーのLAN IPに変更し、そのIPの8090番を開いてください。ホストのファイアウォールでLANのアクセス元だけを許可してください。

LAN内用のアプリで、ログインはありません。DNS名だけではLAN限定になりません。Caddyを使う場合も既存のLAN向けリスナーやアクセス元制限を確認してください。

### 既存Caddyで公開

1. `museum.example.test`などのDNSを既存のサーバーへ向ける。
2. `.env`の`HAKUBUTSUKAN_DOMAIN`と`CADDY_NETWORK`を実環境に合わせる。既存Caddyが参加するDockerネットワーク名を指定する。
3. 起動する。

```sh
docker compose -f compose.yaml -f compose.caddy.yaml up -d --build
```

Caddy用のファイルは既存の`caddy-docker-proxy`にラベルを渡します。既存Caddyや各アプリの設定は変更しません。HTTPS証明書の発行・信頼とLAN制限は既存Caddyの方針に合わせてください。Dockgeを使う場合は、追加ファイルの内容をスタックのComposeに統合しても構いません。

## サービスの掲載

掲載したいアプリの`compose.yaml`のサービスにラベルを追加し、そのサービスを再作成します。DBやCaddyには付けず、利用者が開くアプリだけを指定します。

```yaml
services:
  hanafudakan:
    # 既存の image / ports / networks などはそのまま
    labels:
      hakubutsukan.enable: "true"
      hakubutsukan.name: "花札館"
      hakubutsukan.description: "季節をめくり、一枚の札から遊びがはじまる。"
      hakubutsukan.url: "https://hanafudakan.example.test"
      hakubutsukan.category: "ゲーム"
      hakubutsukan.icon: "花"
      hakubutsukan.order: "20"
```

| ラベル | 意味 |
|---|---|
| `hakubutsukan.enable` | `true`で掲載。未設定は掲載しない |
| `hakubutsukan.name` | 表示名。省略時はComposeサービス名 |
| `hakubutsukan.description` | 説明文 |
| `hakubutsukan.url` | ブラウザからアクセスできるHTTP(S) URL |
| `hakubutsukan.category` | 分類。省略時「その他」 |
| `hakubutsukan.icon` | 文字または絵文字（画像URLではない） |
| `hakubutsukan.order` | 小さい順。省略時0 |
| `hakubutsukan.id` | 任意の固定ID。省略時はComposeプロジェクト名/サービス名 |

URLを省略した場合、単純な`caddy`ホスト名ラベルがあればHTTPS URLを補います。複数ドメイン・複雑な設定では専用URLを明示してください。URLを空に指定すると補完せず「URL未設定」になります。公開ポートからの推測はしません。別端末から開くURLに`localhost`や`127.0.0.1`を指定しないでください。

同じプロジェクト・サービスのレプリカは一枚にまとめ、停止・不健康な状態を優先表示します。複数のサービスを同じIDにまとめる場合は、表示用のラベルも揃えてください。お気に入りはIDに紐付き、ブラウザ・端末間の同期はありません。

アプリとcollectorでそれぞれ15秒ごとに取得するため、変更反映には通常最大約30秒かかります。ブラウザも15秒ごとに取得します。`REFRESH_INTERVAL`でサーバー側の間隔を変更できます。

## Dockerがなくてもデモを見る

```sh
npm ci
npm run build
DEMO_MODE=true go run .
# http://localhost:8080
```

またはソケット不要のComposeを使用します。

```sh
docker compose -f compose.demo.yaml up -d --build
# http://localhost:8090
```

デモは常に明示され、実環境へ接続できない場合に自動でデモへ切り替わることはありません。実URLが分からない展示は「URL未設定」と表示します。

## 開発・検証

Go 1.22以上（DockerビルドはGo 1.27）を使用します。外部Goライブラリはありません。ローカル開発ではNode.js 18以上も使用し、`npm ci && npm run build` でフロントエンドを作成してからGoを起動してください。Composeは両方を自動でビルドします。

```sh
npm ci
npm run build
go test -race ./...
go vet ./...
go build ./...
docker compose config --quiet
```

- `GET /api/catalog`: サニタイズした展示一覧と最終取得時刻、取得失敗状態
- `GET /healthz`: プロセスの生存確認。Docker情報の鮮度は`/api/catalog`の`stale`で確認
- collector側は内部用の`GET /catalog`と`GET /healthz`だけを提供

ローカルでcollectorとWebを別々に実行する場合:

```sh
LISTEN_ADDR=:8081 go run . collector
COLLECTOR_URL=http://127.0.0.1:8081 go run .
```

`LISTEN_ADDR`は`:8080`形式で指定します。ソケットの場所を変える場合はcollectorに`DOCKER_SOCKET`を指定してください。収集は現在のDocker APIバージョンを取得してから実行します。

## 更新・停止

```sh
docker compose up -d --build
docker compose logs --tail=100
docker compose down
```

Caddy追加ファイルを使う場合は、更新・停止時も同じ`-f compose.yaml -f compose.caddy.yaml`を指定してください。
