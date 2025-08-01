# Hooks Stop Timing Fix - 修正レポート

## 問題の概要

HooksでStopフックが期待よりも頻繁に実行される問題がありました。具体的には、Web検索ツールなどの個別ツール実行完了時にもStopフックが実行されていました。

## 問題の原因

1. **useIdleStopHook**: StreamingState.RespondingからStreamingState.Idleへの遷移時に即座にStopフックを実行
2. **CoreToolScheduler**: 個別のツール完了時にもStopフックを実行
3. **重複実行**: 同一の応答に対してStopフックが複数回実行される可能性

## 修正内容

### 1. useIdleStopHook の改良

**ファイル**: `packages/cli/src/ui/hooks/useIdleStopHook.ts`

- **タイムアウト機能追加**: Idle状態が1秒間継続した場合のみStopフックを実行
- **状態安定性チェック**: 一時的なツール間のIdle状態では実行しない
- **適切なクリーンアップ**: useEffectのクリーンアップ関数でタイムアウトをクリア

```typescript
// 1秒間のタイムアウトで安定性を確認
idleTimeoutRef.current = setTimeout(() => {
  if (streamingState === StreamingState.Idle && !isExecutingRef.current) {
    executeStopHook();
  }
}, 1000);
```

### 2. CoreToolScheduler の修正

**ファイル**: `packages/core/src/core/coreToolScheduler.ts`

- **重複実行の防止**: 個別ツール完了時のStopフック実行を削除
- **責任の明確化**: Stop実行をUIレイヤーに一元化

### 3. nonInteractiveCliモードの保持

**ファイル**: `packages/cli/src/nonInteractiveCli.ts`

- **適切な実行タイミング**: 非インタラクティブモードでは各ターン完了時に実行（変更なし）
- **コメント改良**: 実行理由を明確化

### 4. ドキュメント更新

**ファイル**: `docs/hooks.md`

- Stop実行タイミングの詳細説明
- ツール実行間では実行されないことを明記
- 安定性チェック（1秒間継続）について説明

**ファイル**: `examples/hooks-example-settings.json`

- サンプルコマンドメッセージの改良

## 期待される効果

1. **適切なタイミング**: ユーザーアクションを求める時または処理が完了した時のみ実行
2. **重複実行の防止**: 同一応答に対する複数回実行を回避
3. **ツール間実行の防止**: Web検索などのツール完了後の一時的Idle状態では実行しない

## テスト方法

1. Stopフックを設定
2. Web検索を含む複数ツールを使用する質問を実行
3. Stopフックが応答完了時のみ実行されることを確認

## 修正日時

2025年2月1日