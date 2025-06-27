# カスタムエンドポイント接続（litellm/ollama対応）

Gemini CLIは、litellmやollamaなどのOpenAI互換APIエンドポイントと接続することができます。

## 設定方法

### 1. 環境変数での設定

```bash
export CUSTOM_BASE_URL="http://localhost:11434/v1"  # Ollamaの場合
export CUSTOM_API_KEY="your-api-key"                # 必要に応じて
export GEMINI_MODEL="llama2"                        # 使用するモデル名
```

### 2. コマンドラインオプション

```bash
gemini --custom-endpoint "http://localhost:11434/v1" \
       --custom-api-key "your-api-key" \
       --model "llama2"
```

## 対応プロバイダー

### Ollama

```bash
# Ollamaサーバーを起動
ollama serve

# Gemini CLIで接続
export CUSTOM_BASE_URL="http://localhost:11434/v1"
export GEMINI_MODEL="llama2"
gemini
```

### litellm

```bash
# litellmサーバーを起動
litellm --model huggingface/microsoft/DialoGPT-medium

# Gemini CLIで接続
export CUSTOM_BASE_URL="http://localhost:8000"
export CUSTOM_API_KEY="your-api-key"
export GEMINI_MODEL="huggingface/microsoft/DialoGPT-medium"
gemini
```

### その他のOpenAI互換API

任意のOpenAI互換APIエンドポイントに接続できます：

```bash
export CUSTOM_BASE_URL="https://your-api-endpoint.com/v1"
export CUSTOM_API_KEY="your-api-key"
export GEMINI_MODEL="your-model-name"
gemini
```

## 対応機能

### ✅ 実装済み
- 基本的なチャット機能
- ストリーミングレスポンス
- トークン数概算
- エラーハンドリング
- 関数呼び出し機能（OpenAI互換）
- 埋め込み機能（対応エンドポイントのみ）

### ⚠️ 制限事項
- 一部の高度なGemini機能は利用不可
- 埋め込み機能は対応エンドポイントのみ
- ツール呼び出しはOpenAI形式のみ対応
- トークン数の計算は概算値となります

## トラブルシューティング

### 接続エラー

```bash
# エンドポイントの疎通確認
curl -X POST "http://localhost:11434/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### デバッグモード

```bash
gemini --debug --custom-endpoint "http://localhost:11434/v1"
```

## 設定例

### .env ファイル

```env
# Ollama設定
CUSTOM_BASE_URL=http://localhost:11434/v1
GEMINI_MODEL=llama2

# litellm設定
# CUSTOM_BASE_URL=http://localhost:8000
# CUSTOM_API_KEY=your-api-key
# GEMINI_MODEL=gpt-3.5-turbo
``` 