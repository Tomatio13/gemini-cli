# Gemini CLI オリジナル機能復元ガイド

このガイドは、Upstreamマージ後にオリジナル機能（OpenAI互換、Hooks、カスタムコマンド）が失われた場合の復元手順を記載しています。

## 📋 復元が必要な機能一覧

1. **OpenAI互換機能** - `--auth-type openai-compatible`でOpenAI APIを使用
2. **Hooks機能** - PreToolUse、Stop等のイベントフック実行
3. **カスタムコマンド** - スラッシュコマンドの拡張機能

## 🔧 1. OpenAI互換機能の復元

### 1.1 CLI引数の追加

**ファイル:** `packages/cli/src/config/config.ts`

```typescript
// CliArgs interfaceに追加
export interface CliArgs {
  // ... 既存のプロパティ
  authType: string | undefined;
}

// parseArguments()関数内のyargsに追加
.option('auth-type', {
  type: 'string',
  description: 'Authentication type (gemini-api-key, openai-compatible, anthropic, etc.)',
  choices: ['gemini-api-key', 'vertex-ai', 'login-with-google', 'cloud-shell', 'openai-compatible', 'anthropic', 'local-llm'],
})

// loadCliConfig()関数内のConfig作成時に追加
const finalAuthType = argv.authType || settings.selectedAuthType;

return new Config({
  // ... 既存のプロパティ
  authType: finalAuthType,
});
```

### 1.2 Config クラスの拡張

**ファイル:** `packages/core/src/config/config.ts`

```typescript
// ConfigParameters interfaceに追加
export interface ConfigParameters {
  // ... 既存のプロパティ
  authType?: string;
}

// Config クラスに追加
export class Config {
  // ... 既存のプロパティ
  private readonly authType: string | undefined;

  constructor(params: ConfigParameters) {
    // ... 既存の初期化
    this.authType = params.authType;
  }

  // getter メソッドを追加
  getAuthType(): string | undefined {
    return this.authType;
  }

  // initialize() メソッドを修正
  async initialize(): Promise<void> {
    // ... 既存の初期化処理
    
    // authType未設定時の自動検出を追加
    let effectiveAuthType = this.authType;
    if (!effectiveAuthType) {
      if (process.env.GEMINI_API_KEY) {
        effectiveAuthType = AuthType.USE_GEMINI;
      } else if (process.env.GOOGLE_API_KEY) {
        effectiveAuthType = AuthType.USE_VERTEX_AI;
      } else if (process.env.OPENAI_API_KEY) {
        effectiveAuthType = AuthType.USE_OPENAI_COMPATIBLE;
      } else if (process.env.ANTHROPIC_API_KEY) {
        effectiveAuthType = AuthType.USE_ANTHROPIC;
      } else if (process.env.CUSTOM_BASE_URL) {
        effectiveAuthType = AuthType.USE_LOCAL_LLM;
      } else if (process.env.CLOUD_SHELL === 'true') {
        effectiveAuthType = AuthType.CLOUD_SHELL;
      } else {
        effectiveAuthType = AuthType.LOGIN_WITH_GOOGLE;
      }
    }
    
    if (effectiveAuthType) {
      this.contentGeneratorConfig = await createContentGeneratorConfig(
        this,
        effectiveAuthType as AuthType,
      );
      this.geminiClient = new GeminiClient(this);
      await this.geminiClient.initialize(this.contentGeneratorConfig);
    }
  }
}
```

### 1.3 認証優先順位の修正

**ファイル:** `packages/cli/src/ui/hooks/useAuthCommand.ts`

```typescript
useEffect(() => {
  const authFlow = async () => {
    // Priority: CLI argument > settings file
    const cliAuthType = config.getAuthType();
    const settingsAuthType = settings.merged.selectedAuthType;
    const authType = cliAuthType || settingsAuthType;
    
    if (isAuthDialogOpen || !authType) {
      return;
    }

    try {
      setIsAuthenticating(true);
      await config.refreshAuth(authType as AuthType);
      console.log(`Authenticated via "${authType}".`);
    } catch (e) {
      setAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      openAuthDialog();
    } finally {
      setIsAuthenticating(false);
    }
  };

  void authFlow();
}, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog]);
```

## 🎣 2. Hooks機能の復元

### 2.1 HookSettings型の復元

**ファイル:** バックアップから `packages/core/src/hooks/hookExecutor.ts` をコピー

もしくは以下の型定義を追加：

```typescript
export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

export interface HookSettings {
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  Notification?: HookMatcher[];
  Stop?: HookMatcher[];
  SubagentStop?: HookMatcher[];
}
```

### 2.2 Config クラスにHooks統合

**ファイル:** `packages/core/src/config/config.ts`

```typescript
import { HookSettings } from '../hooks/hookExecutor.js';

// ConfigParameters interfaceに追加
export interface ConfigParameters {
  // ... 既存のプロパティ
  hooks?: HookSettings;
}

// Config クラスに追加
export class Config {
  // ... 既存のプロパティ
  private readonly hooks: HookSettings | undefined;

  constructor(params: ConfigParameters) {
    // ... 既存の初期化
    this.hooks = params.hooks;
  }

  // getter メソッドを追加
  getHooks(): HookSettings | undefined {
    return this.hooks;
  }
}
```

### 2.3 CLI設定でHooksを渡す

**ファイル:** `packages/cli/src/config/config.ts`

```typescript
// loadCliConfig()関数内のConfig作成時に追加
return new Config({
  // ... 既存のプロパティ
  hooks: settings.hooks,
});
```

### 2.4 useIdleStopHookの使用

**ファイル:** `packages/cli/src/ui/App.tsx`

```typescript
// インポートを追加
import { useIdleStopHook } from './hooks/useIdleStopHook.js';

// App関数内で使用
const App = ({ config, settings, startupWarnings = [], version }: AppProps) => {
  // ... 既存のコード

  // Execute Stop hooks when streaming transitions to Idle
  useIdleStopHook(streamingState, config);

  // ... 残りのコード
};
```

## ⚡ 3. カスタムコマンド機能の復元

### 3.1 CommandKind enumの追加

**ファイル:** `packages/cli/src/ui/hooks/slashCommandProcessor.ts`

```typescript
// enumを追加
export enum CommandKind {
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

// SlashCommand interfaceを修正
export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void> | void;
  kind: CommandKind; // この行を追加
}
```

### 3.2 既存コマンドにkindプロパティ追加

**ファイル:** `packages/cli/src/ui/hooks/slashCommandProcessor.ts`

全ての既存のSlashCommandオブジェクトに以下を追加：

```typescript
const commands: SlashCommand[] = [
  {
    name: 'help',
    description: 'Show available commands',
    kind: CommandKind.SYSTEM, // この行を追加
    handler: () => {
      // ... 既存のハンドラー
    },
  },
  // ... 他のコマンドにも同様に追加
];
```

## 🔍 4. 動作確認方法

### 4.1 OpenAI互換機能のテスト

```bash
# OpenAI API使用
export OPENAI_API_KEY="your-openai-api-key"
gemini --auth-type openai-compatible --model "gpt-4o-mini"

# ローカルLLM使用（Ollama等）
export CUSTOM_BASE_URL="http://localhost:11434/v1"
gemini --auth-type local-llm --model "qwen2.5:1.5b"
```

### 4.2 Hooks機能のテスト

**設定例:** `~/.gemini/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Response completed!'",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**テスト方法:**
- デバッグモードで実行: `gemini --debug`
- AI応答完了時にHooksが実行されることを確認

### 4.3 カスタムコマンドのテスト

```bash
# スラッシュコマンドのヘルプを確認
gemini
> /help
```

## ⚠️ 5. トラブルシューティング

### 5.1 TypeScriptエラーの対処

**エラー:** `Property 'authType' does not exist on type 'ConfigParameters'`
**対処:** ConfigParametersインターフェースにauthType?プロパティを追加

**エラー:** `Property 'getHooks' does not exist on type 'Config'`
**対処:** ConfigクラスにgetHooks()メソッドを追加

**エラー:** `Property 'kind' does not exist on type 'SlashCommand'`
**対処:** SlashCommandインターフェースにkindプロパティを追加

### 5.2 ビルドエラーの対処

```bash
# ビルドを実行してエラーを確認
npm run build

# TypeScriptエラーがある場合、該当ファイルを修正
# 通常は型定義の不一致が原因
```

### 5.3 実行時エラーの対処

**エラー:** `config.getHooks is not a function`
**対処:** ConfigクラスにgetHooks()メソッドが定義されているか確認

**エラー:** `Unknown arguments: auth-type`
**対処:** parseArguments()関数でauth-typeオプションが定義されているか確認

## 📝 6. チェックリスト

復元作業完了後、以下を確認してください：

- [ ] `npm run build` が成功する
- [ ] `--auth-type openai-compatible` でOpenAI APIに接続できる
- [ ] `--auth-type local-llm` でローカルLLMに接続できる
- [ ] Stop Hooksが応答完了時に実行される
- [ ] `/help` でスラッシュコマンド一覧が表示される
- [ ] 対話モードと非対話モード両方で正常動作する

## 🔗 関連ファイル一覧

### 修正が必要な主要ファイル：
- `packages/cli/src/config/config.ts` - CLI設定とarg parsing
- `packages/core/src/config/config.ts` - Core Config クラス
- `packages/cli/src/ui/hooks/useAuthCommand.ts` - 認証優先順位
- `packages/cli/src/ui/App.tsx` - useIdleStopHookの使用
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` - CommandKind追加

### バックアップから復元が必要なファイル：
- `packages/core/src/hooks/hookExecutor.ts` - Hooks実行エンジン
- `packages/cli/src/ui/hooks/useIdleStopHook.ts` - Stop hooks呼び出し

---

**注意:** この手順書は実際の復元作業で検証済みです。手順通りに実行すれば、全ての機能が正常に動作するはずです。不明な点があれば、バックアップディレクトリ `.backup-original-features` を参照してください。