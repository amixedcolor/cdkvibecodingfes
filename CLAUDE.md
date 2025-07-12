# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

これはAWS CDK (Cloud Development Kit) TypeScriptプロジェクトです。Infrastructure as Codeを使用してAWSリソースを定義・デプロイします。

## 開発コマンド

### ビルドとコンパイル
```bash
cd cdk
npm run build    # TypeScriptをJavaScriptにコンパイル
npm run watch    # ファイル変更を監視して自動コンパイル
```

### テスト実行
```bash
cd cdk
npm run test              # 全テストを実行
npm run test -- --watch   # ウォッチモードでテスト実行
npm run test path/to/test # 特定のテストファイルを実行
```

### CDKコマンド
```bash
cd cdk
npx cdk synth             # CloudFormationテンプレートを生成
npx cdk diff              # デプロイ済みスタックと現在の差分を表示
npx cdk deploy            # スタックをAWSにデプロイ
npx cdk destroy           # スタックを削除
npx cdk ls                # 定義されているスタック一覧を表示
```

## プロジェクト構造

### 主要ディレクトリ
- `/cdk/` - メインのCDKプロジェクトディレクトリ
  - `/bin/cdk.ts` - CDKアプリケーションのエントリーポイント
  - `/lib/` - スタック定義を配置するディレクトリ
    - `cdk-stack.ts` - メインスタック定義
  - `/test/` - Jestテストファイル

### アーキテクチャ概要
1. **エントリーポイント** (`bin/cdk.ts`): CDKアプリケーションを初期化し、スタックをインスタンス化
2. **スタック定義** (`lib/cdk-stack.ts`): AWSリソースを定義する場所。各スタックは`Stack`クラスを継承
3. **コンストラクト**: CDKの基本構成要素。リソースはConstructsとして定義され、階層的に組織化

### 重要な設定
- **TypeScript**: ES2022ターゲット、NodeNextモジュールシステム使用
- **CDKバージョン**: aws-cdk-lib 2.202.0
- **テストフレームワーク**: Jest with ts-jest
- **厳密モード**: TypeScriptの厳密モードが有効

## 開発時の注意点

1. 新しいスタックを追加する場合は、`lib/`ディレクトリに新しいファイルを作成し、`bin/cdk.ts`でインスタンス化
2. リソース定義時は、CDKのベストプラクティスに従い、L2コンストラクトを優先的に使用
3. 環境固有の設定は、CDK Contextまたは環境変数を使用
4. デプロイ前に必ず`cdk diff`で変更内容を確認