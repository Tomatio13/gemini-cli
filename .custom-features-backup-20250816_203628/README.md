# 独自機能バックアップ - 2025年8月16日 20:36:28

このディレクトリには、Upstreamマージ前の独自機能が保存されています。

## バックアップされた機能

### 1. OpenAI互換API接続機能
- `litellmGeminiContentGenerator.ts` - LiteLLM経由でGemini APIを呼び出す専用実装
- `customContentGenerators.ts` - OpenAI/Anthropic用ContentGenerator
- `integration-points/contentGenerator.ts` - プロバイダー統合ロジック

### 2. Hooks機能
- `hooks/` ディレクトリ一式
  - `hookExecutor.ts` - Hook実行エンジン (301行)
  - `hookExecutor.test.ts` - テストスイート
  - `hookExecutor.integration.test.ts` - 統合テスト
- `useNotificationHook.ts` - 通知Hook
- 統合箇所:
  - `integration-points/coreToolScheduler.ts`
  - `integration-points/nonInteractiveCli.ts`
  - `integration-points/settings.ts`
  - `integration-points/nonInteractiveToolExecutor.ts`

### 3. カスタムスラッシュコマンド機能
- `customSlashCommands.ts` - カスタムコマンド管理 (258行)
- `CustomSlashCommandLoader.ts` - ローダー
- 統合箇所:
  - `integration-points/slashCommandProcessor.ts`
  - `integration-points/nonInteractiveCli.ts`

## 復元時の注意事項

1. **LiteLLM機能**: Gemini特有のツール（Google Search、Code Execution、MCP）を保持する重要な実装
2. **Hooks機能**: イベントドリブンなHook実行システム（承認/ブロック決定機能付き）
3. **カスタムスラッシュコマンド**: `~/.gemini/commands/`からのMarkdownベースコマンド読み込み

## バックアップ作成日時
2025年8月16日 20:36:28

## Upstreamマージ前の状態
- ローカルmainブランチ: 9b1cd51c
- Upstream/main: bc60257e (265コミット先行)