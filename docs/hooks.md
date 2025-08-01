# Hooks

Gemini CLIのフック機能により、CLIのライフサイクルの様々な時点でユーザー定義のシェルコマンドを実行できます。これはClaude Codeのフック機能をベースに実装されています。

## 概要

フックは以下の5つのイベントタイプで実行できます：

- **PreToolUse**: ツール実行前
- **PostToolUse**: ツール実行後  
- **Notification**: 通知表示時
- **Stop**: AIの応答完了時（IDLE状態）- ユーザーからの質問に対してAIが応答を完了し、次の入力を待機している状態が安定したときに実行（一時的なツール実行間のIdle状態では実行されません）
- **SubagentStop**: サブエージェント終了時（将来実装予定）

## 設定

フックは設定ファイル（`~/.gemini/settings.json`または`.gemini/settings.json`）で設定します：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file|edit",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'ファイル操作前チェック' >&2",
            "timeout": 5000
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'ツール実行完了' >&2"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '通知: $notification_type - $message' >&2"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'AI応答完了' >&2"
          }
        ]
      }
    ]
  }
}
```

## 設定構造

### HookMatcher

```typescript
interface HookMatcher {
  matcher?: string;  // 正規表現パターン（オプション）
  hooks: HookCommand[];
}
```

### HookCommand

```typescript
interface HookCommand {
  type: 'command';
  command: string;   // 実行するシェルコマンド
  timeout?: number;  // タイムアウト（ミリ秒、デフォルト: 60000）
}
```

## マッチャーパターン

`matcher`フィールドは正規表現パターンです：

- 空の場合、すべてのイベントにマッチ
- ツールイベントでは`tool_name`と照合
- 正規表現をサポート（例：`write_file|edit`）
- 大文字小文字を区別しない

## 入力データ

フックコマンドはstdinでJSON形式のデータを受け取ります：

### PreToolUse / PostToolUse
```json
{
  "session_id": "session_123",
  "transcript_path": "/home/user/.gemini/tmp/abc123/logs.json",
  "tool_name": "write_file",
  "tool_input": { "filename": "test.txt", "content": "Hello" }
}
```

### PostToolUse（追加）
```json
{
  "tool_response": "ファイルが正常に作成されました"
}
```

### Notification
```json
{
  "session_id": "session_123", 
  "transcript_path": "/home/user/.gemini/tmp/abc123/logs.json",
  "notification_type": "info",
  "message": "操作完了",
  "timestamp": "2025-01-27T10:00:00.000Z"
}
```

### Stop
```json
{
  "session_id": "session_123",
  "transcript_path": "/home/user/.gemini/tmp/abc123/logs.json",
  "stop_reason": "response_complete",
  "session_duration": "",
  "timestamp": "2025-01-27T10:00:00.000Z"
}
```

## 重要な注意事項

### Stopフックについて

- **実行タイミング**: Stopフックは、AIが応答を完了してIDLE状態が安定したとき（1秒間継続）に実行されます
- **ツール実行間では実行されません**: Web検索などのツール実行完了後の一時的なIdle状態では実行されません
- **セッション終了時には実行されません**: `/quit`コマンドやCtrl+Cでの終了時にはStopフックは実行されません
- **音楽再生などの用途**: AIの応答完了を音で知らせたい場合などに使用できます
- **非同期実行**: Stopフックは非同期で実行され、CLIの動作をブロックしません
- **重複実行の防止**: 同一の応答に対してStopフックが複数回実行されることを防ぎます

### 使用例

AIの応答完了時に音楽を再生する例：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cvlc ~/.claude/assets/notification.mp3 --intf dummy --play-and-exit",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```