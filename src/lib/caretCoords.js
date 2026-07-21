/**
 * 取得 textarea 內游標的座標（相對於 textarea 左上角的 padding box）。
 *
 * 作法：建立一個樣式與 textarea 完全一致的鏡像 div，把游標前的文字放進去，
 * 再用一個 span 標出游標位置，量測該 span 的 offsetTop / offsetLeft。
 *
 * ⚠ 為什麼不能用 getComputedStyle(el).font：
 *   Chrome 對 font 簡寫回傳空字串（除非作者端明確寫了 font: ...），
 *   套到鏡像上會導致字體與寬度全錯，量出來的座標會飄到畫面外。
 *   所以這裡逐一複製長屬性。
 */

const MIRROR_PROPS = [
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "wordSpacing",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
  "wordBreak",
  "tabSize",
];

export function getCaretCoordinates(el, position) {
  if (!el || typeof document === "undefined") return { top: 0, left: 0, height: 18 };

  const cs = window.getComputedStyle(el);
  const div = document.createElement("div");
  const s = div.style;

  s.position = "absolute";
  s.visibility = "hidden";
  s.top = "0";
  s.left = "0";
  s.whiteSpace = "pre-wrap";
  s.wordWrap = "break-word";
  s.overflow = "hidden";
  for (const prop of MIRROR_PROPS) {
    if (cs[prop]) s[prop] = cs[prop];
  }
  // clientWidth 已扣掉捲軸，是實際可排版寬度
  s.width = `${el.clientWidth}px`;

  const value = String(el.value || "");
  div.textContent = value.slice(0, position);

  // 標記游標位置。後面補一個字元，避免空字串 span 量不到位置。
  const marker = document.createElement("span");
  marker.textContent = value.slice(position) || ".";
  div.appendChild(marker);

  document.body.appendChild(div);
  const top = marker.offsetTop + (parseFloat(cs.borderTopWidth) || 0);
  const left = marker.offsetLeft + (parseFloat(cs.borderLeftWidth) || 0);
  document.body.removeChild(div);

  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 18;

  // 扣掉捲動量，換算成「畫面上看得到的位置」
  return {
    top: top - el.scrollTop,
    left: left - el.scrollLeft,
    height: lineHeight,
  };
}

/** 把浮層夾在容器可視範圍內，避免超出右緣或被裁掉 */
export function clampMenuPosition({ top, left, menuWidth, menuHeight, containerWidth, containerHeight }) {
  const maxLeft = Math.max(0, containerWidth - menuWidth);
  const clampedLeft = Math.min(Math.max(0, left), maxLeft);
  // 下方空間不足就翻到游標上方
  const flip = top + menuHeight > containerHeight && top - menuHeight > 0;
  return { top: flip ? Math.max(0, top - menuHeight) : top, left: clampedLeft, flipped: flip };
}
