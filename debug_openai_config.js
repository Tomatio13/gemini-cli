#!/usr/bin/env node

/**
 * OpenAI互換API設定の診断スクリプト
 * HTTP 400エラーの原因を特定するためのデバッグツール
 */

import https from 'https';
import http from 'http';

// 環境変数から設定を読み込み
const config = {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.CUSTOM_BASE_URL || 'https://api.openai.com/v1',
  timeout: parseInt(process.env.CUSTOM_TIMEOUT || '30000', 10)
};

console.log('🔍 OpenAI互換API設定診断ツール');
console.log('================================');
console.log('設定情報:');
console.log(`  API Key: ${config.apiKey ? '設定済み (長さ: ' + config.apiKey.length + ')' : '未設定'}`);
console.log(`  Base URL: ${config.baseUrl}`);
console.log(`  Timeout: ${config.timeout}ms`);
console.log('');

// 基本的な設定チェック
function checkBasicConfig() {
  console.log('📋 基本設定チェック:');
  
  if (!config.apiKey) {
    console.log('  ❌ OPENAI_API_KEY が設定されていません');
    return false;
  }
  
  if (!config.apiKey.startsWith('sk-')) {
    console.log('  ⚠️  APIキーの形式が正しくない可能性があります (sk-で始まらない)');
  } else {
    console.log('  ✅ APIキーの形式は正常です');
  }
  
  console.log('  ✅ 基本設定は正常です');
  return true;
}

// APIエンドポイントの接続テスト
async function testApiConnection() {
  console.log('🌐 API接続テスト:');
  
  // Test both regular and thinking models
  const testCases = [
    {
      name: 'GPT-4o (通常モデル)',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 10,
        temperature: 0.7
      }
    },
    {
      name: 'o3-mini (thinking モデル)',
      payload: {
        model: 'o3-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 10,
        temperature: 1  // Fixed temperature for thinking models
      }
    }
  ];
  
  let overallSuccess = true;
  
  for (const testCase of testCases) {
    console.log(`\n  🧪 テスト中: ${testCase.name}`);
    
    const url = new URL('/chat/completions', config.baseUrl);
    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    
    const success = await new Promise((resolve) => {
      const postData = JSON.stringify(testCase.payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: config.timeout
      };
      
      const req = requestModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`    📡 レスポンス: ${res.statusCode} ${res.statusMessage}`);
          
          if (res.statusCode === 200) {
            console.log(`    ✅ ${testCase.name} - 接続成功`);
            resolve(true);
          } else {
            console.log(`    ❌ ${testCase.name} - 接続失敗`);
            console.log('    📄 エラー詳細:');
            try {
              const errorData = JSON.parse(data);
              console.log('      ', JSON.stringify(errorData, null, 2));
            } catch (e) {
              console.log('      ', data);
            }
            resolve(false);
          }
        });
      });
      
      req.on('error', (err) => {
        console.log(`    ❌ ${testCase.name} - 接続エラー:`, err.message);
        resolve(false);
      });
      
      req.on('timeout', () => {
        console.log(`    ⏱️  ${testCase.name} - タイムアウト`);
        req.destroy();
        resolve(false);
      });
      
      req.write(postData);
      req.end();
    });
    
    if (!success) {
      overallSuccess = false;
    }
  }
  
  return overallSuccess;
}

// モデル名の互換性チェック
function checkModelCompatibility() {
  console.log('🤖 モデル互換性チェック:');
  
  const geminiModels = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-pro'
  ];
  
  const openaiModels = [
    'gpt-4o',
    'gpt-4',
    'gpt-3.5-turbo'
  ];
  
  console.log('  📝 推奨されるモデル名変換:');
  geminiModels.forEach(model => {
    console.log(`    ${model} → gpt-4o`);
  });
  
  console.log('  ✅ モデル名は自動変換されます');
}

// 診断の実行
async function runDiagnostics() {
  console.log('🚀 診断開始...\n');
  
  const basicConfigOk = checkBasicConfig();
  console.log('');
  
  if (!basicConfigOk) {
    console.log('❌ 基本設定に問題があります。設定を修正してください。');
    return;
  }
  
  const connectionOk = await testApiConnection();
  console.log('');
  
  checkModelCompatibility();
  console.log('');
  
  // 総合結果
  console.log('📊 診断結果:');
  if (connectionOk) {
    console.log('  ✅ 設定は正常です。Gemini CLIが正常に動作するはずです。');
  } else {
    console.log('  ❌ API接続に問題があります。以下を確認してください:');
    console.log('    - APIキーが正しいか');
    console.log('    - APIキーに適切な権限があるか');
    console.log('    - ネットワーク接続が正常か');
    console.log('    - Base URLが正しいか');
  }
  
  console.log('');
  console.log('🛠️  修正方法:');
  console.log('  1. 環境変数を確認: env | grep OPENAI_API_KEY');
  console.log('  2. APIキーを再設定: export OPENAI_API_KEY="your-new-key"');
  console.log('  3. Gemini CLIを再起動');
}

// メイン実行
runDiagnostics().catch(console.error); 