export const themes = {
  classic: { name: 'クラシック', eyebrow: 'THE PERMANENT COLLECTION', title: '常設展示室', caption: '日々の営みを、蒐集する。', background: '#213b32', sky: '#f5ead3', ground: '#493b29', ambient: '#f2ead9', hemisphere: 1.5, exposure: 1, spot: '#fff2d4', frame: '#645e4b', mount: '#efecdf' },
  louvre: { name: 'ルーブル風', eyebrow: 'LE GRAND PALAIS', title: '光の宮殿', caption: '石と金彩がつなぐ、悠久の回廊。', background: '#c9bca5', sky: '#fff5df', ground: '#a39783', ambient: '#fff5df', hemisphere: 2, exposure: 1.1, spot: '#fff1ce', frame: '#ad8542', mount: '#f5eddc' },
  japanese: { name: '和', eyebrow: '和のしつらえ · JAPANESE GALLERY', title: '和敬清寂', caption: '光を漉き、余白を愛でる。', background: '#35392e', sky: '#fff0cb', ground: '#58503b', ambient: '#fff0cf', hemisphere: 1.5, exposure: 1, spot: '#ffe1a0', frame: '#30251e', mount: '#e6d8b7' },
  cyberpunk: { name: 'サイバーパンク', eyebrow: 'ARCHIVE // SECTOR 09', title: '電脳博物館', caption: '記憶を接続せよ。未来を蒐集せよ。', background: '#070b1c', sky: '#7995ce', ground: '#18112c', ambient: '#7283ce', hemisphere: 1.1, exposure: 1.15, spot: '#9bddff', frame: '#111b2b', mount: '#283245' },
};

export const themeStorageKey = 'hakubutsukan.theme';
export function validTheme(value) {
  return Object.hasOwn(themes, value) ? value : 'classic';
}
export function loadTheme(storage) {
  try { return validTheme(storage.getItem(themeStorageKey)); } catch { return 'classic'; }
}
