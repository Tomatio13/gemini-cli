# カスタムエンドポイント実装概要

## 概要

Gemini CLIにlitellmやollamaなどのOpenAI互換APIエンドポイントとの接続機能を追加しました。

## 実装されたファイル

### 1. Core実装

#### `packages/core/src/core/contentGenerator.ts`
- 新しい認証タイプ `USE_CUSTOM_ENDPOINT` を追加
- `ContentGeneratorConfig` に `baseUrl` フィールドを追加
- `CustomEndpointContentGenerator` クラスを実装
  - OpenAI互換APIとの通信を担当
  - GeminiのContent形式とOpenAIのMessage形式の相互変換
  - ストリーミングレスポンスの対応
  - トークン数の概算計算

#### 主要メソッド
- `convertContentToOpenAI()`: Gemini形式からOpenAI形式への変換（関数呼び出し対応）
- `convertToolsToOpenAI()`: Geminiツール定義をOpenAI形式に変換
- `convertOpenAIToGemini()`: OpenAI形式からGemini形式への変換（関数呼び出し対応）
- `generateContent()`: 単発のコンテンツ生成（ツール対応）
- `generateContentStream()`: ストリーミングコンテンツ生成（ツール対応）
- `countTokens()`: トークン数の概算
- `embedContent()`: 埋め込み生成（対応エンドポイントのみ）

### 2. CLI設定

#### `packages/cli/src/config/config.ts`
- `--custom-endpoint`: カスタムエンドポイントURL指定
- `--custom-api-key`: APIキー指定
- 環境変数サポート:
  - `CUSTOM_BASE_URL`: ベースURL
  - `CUSTOM_API_KEY`: APIキー

### 3. ドキュメント

#### `docs/custom-endpoints.md`
- 使用方法の詳細説明
- 各プロバイダー（Ollama、litellm）の設定例
- トラブルシューティング

### 4. テスト

#### `integration-tests/custom-endpoint.test.js`
- モックサーバーを使用したインテグレーションテスト
- 環境変数とCLIフラグの両方のテスト

## 使用方法

### 基本的な使用方法

```bash
# 環境変数で設定
export CUSTOM_BASE_URL="http://localhost:11434/v1"
export GEMINI_MODEL="llama2"
gemini

# またはCLIフラグで設定
gemini --custom-endpoint "http://localhost:11434/v1" --model "llama2"
```

### Ollamaとの接続

```bash
# Ollamaサーバー起動
ollama serve

# Gemini CLIで接続
export CUSTOM_BASE_URL="http://localhost:11434/v1"
export GEMINI_MODEL="llama2"
gemini "プログラミングについて教えて"
```

### litellmとの接続

```bash
# litellmサーバー起動
litellm --model huggingface/microsoft/DialoGPT-medium

# Gemini CLIで接続
export CUSTOM_BASE_URL="http://localhost:8000"
export GEMINI_MODEL="huggingface/microsoft/DialoGPT-medium"
gemini "Hello, how are you?"
```

## 技術的詳細

### API変換

1. **リクエスト変換**: Gemini の `Content[]` 形式を OpenAI の `messages` 形式に変換
2. **レスポンス変換**: OpenAI の ChatCompletion 形式を Gemini の `GenerateContentResponse` 形式に変換
3. **ストリーミング**: Server-Sent Events (SSE) 形式のストリーミングレスポンスを処理

### 対応機能

#### ✅ 実装済み
- 基本的なチャット機能
- ストリーミングレスポンス
- 関数呼び出し（Function Calling）OpenAI互換
- 埋め込み機能（対応エンドポイントのみ）
- ツール呼び出しのサポート
- トークン数の概算

#### ⚠️ 制限事項
- 思考モードなどの高度な機能は利用できない場合がある
- トークン数は概算値（文字数÷4で計算）
- 埋め込み機能は対応エンドポイントのみ

### エラーハンドリング

- HTTP接続エラーの適切な処理
- 不正なJSONレスポンスのスキップ
- AbortSignalによるキャンセル対応

## 今後の拡張予定

1. **型エラーの完全解決**: TypeScript型定義の改善
2. **認証方式拡張**: Bearer Token以外の認証方式
3. **設定ファイル対応**: `.gemini/settings.json` での設定管理
4. **プロバイダー別最適化**: 各プロバイダーの特性に応じた最適化
5. **追加のテストケース**: より包括的なテストカバレッジ

## テスト実行

```bash
# インテグレーションテスト実行
npm test integration-tests/custom-endpoint.test.js

# 全テスト実行
npm test
``` 