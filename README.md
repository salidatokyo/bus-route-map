# 路線バス ルートマップ

京都市営バス、都営バス、仙台市営バス、京王バス、横浜市営バスの GTFS を使った、系統別ルート確認用の静的 Web アプリです。
画面上部のプルダウンで表示するバス事業者を切り替えられます。

## 起動方法

`start_kyoto_bus_map.cmd` をダブルクリックすると、ローカルサーバーを起動してブラウザを開きます。

手動で起動する場合:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:8000/index.html
```

## データ生成

GTFS zip を `gtfs` フォルダに置いてから `data.js` を生成します。未展開の場合は `.gtfs_work` 配下に自動展開します。

- `gtfs/Kyoto_City_Bus_GTFS-20260525.zip`
- `gtfs/ToeiBus-GTFS.zip`
- `gtfs/Sendai_city_bus_realtime_information-20260601.zip`
- `gtfs/Keio_AllLines-20260404.zip`
- `gtfs/Yokohama_City_Bus-20260601.zip`

```bash
node scripts/build_bus_data.js
```

生成結果は `window.BUS_ROUTE_DATASETS` にまとめられ、既定では京都市営バスを表示します。

## 注意

地図表示には Leaflet と OpenStreetMap タイルを CDN 経由で使用します。表示時にはインターネット接続が必要です。
