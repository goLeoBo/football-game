// 球员照片：自动收集 src/assets/players 下的图片，文件名 = 球星卡 id
// 想换某位球员的照片，直接用同名文件覆盖即可（例如 messi.jpg）。
const modules = import.meta.glob('../../assets/players/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const PHOTOS = {};
for (const [path, url] of Object.entries(modules)) {
  const m = /([^/]+)\.(jpe?g|png|webp)$/i.exec(path);
  if (m) PHOTOS[m[1]] = url;
}

export function playerPhoto(id) {
  return PHOTOS[id] || '';
}

export const playerPhotoCount = Object.keys(PHOTOS).length;
