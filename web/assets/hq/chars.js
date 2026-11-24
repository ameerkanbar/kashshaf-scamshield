// Kashshaf HQ: vector characters (citizen in kandura + ghutra, Abu Dhabi Police officers, prisoners).
// Every character is an SVG (viewBox 200x400) drawn in 4 directions with 3 walking frames.
(function () {
  const SKIN = {
    light: ["#f1cfa8", "#c99366"], medium: ["#e0ac7e", "#a9713f"], tan: ["#c98c5c", "#8c5a31"], dark: ["#9c6842", "#663d20"],
  };
  // 2021 ADP uniforms: navy (administrative) and greyish blue (field). Black beret band, silver insignia.
  const UNI = {
    admin: { c: "#1b2f57", d: "#0e1b37", l: "#2d4b84", beret: "#0d1830" },
    field: { c: "#506a85", d: "#344a61", l: "#7090b0", beret: "#1f3149" },
    prisoner: { c: "#ec7f34", d: "#b8561d", l: "#f6a463", beret: null },
  };
  const HAIR = { black: "#17110c", brown: "#2b1e14", grey: "#6f6a64" };

  function defs(o) {
    const s = SKIN[o.skin || "tan"], u = UNI[o.uni || "admin"];
    return `<defs>
      <linearGradient id="kan" x1="0" x2="1"><stop offset="0" stop-color="#c9c4b6"/><stop offset=".2" stop-color="#f1efe8"/><stop offset=".5" stop-color="#ffffff"/><stop offset=".82" stop-color="#ece9e1"/><stop offset="1" stop-color="#c4bfb0"/></linearGradient>
      <linearGradient id="kanV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".75" stop-color="#000" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>
      <linearGradient id="ghu" x1="0" x2="1"><stop offset="0" stop-color="#d4cfc2"/><stop offset=".28" stop-color="#fbfaf6"/><stop offset=".7" stop-color="#ffffff"/><stop offset="1" stop-color="#d1ccbd"/></linearGradient>
      <radialGradient id="skin" cx=".42" cy=".36" r=".78"><stop offset="0" stop-color="${s[0]}"/><stop offset="1" stop-color="${s[1]}"/></radialGradient>
      <linearGradient id="uni" x1="0" x2="1"><stop offset="0" stop-color="${u.d}"/><stop offset=".28" stop-color="${u.c}"/><stop offset=".58" stop-color="${u.l}"/><stop offset="1" stop-color="${u.d}"/></linearGradient>
      <linearGradient id="leg" x1="0" x2="1"><stop offset="0" stop-color="${u.d}"/><stop offset=".5" stop-color="${u.c}"/><stop offset="1" stop-color="${u.d}"/></linearGradient>
      <linearGradient id="shoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4a4a"/><stop offset=".45" stop-color="#141414"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="beret" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${u.l}"/><stop offset=".5" stop-color="${u.beret || "#000"}"/><stop offset="1" stop-color="#05080f"/></linearGradient>
      <linearGradient id="sandal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5f37"/><stop offset="1" stop-color="#4e331b"/></linearGradient>
    </defs>`;
  }
  const svg = (o, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400" width="200" height="400">${defs(o)}${inner}</svg>`;
  const mirror = (inner) => `<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;

  // ---------- faces ----------
  function faceFront(o, cy = 80) {
    const s = SKIN[o.skin || "tan"], hair = HAIR[o.hair || "black"];
    const beard = o.beard === false ? "" : o.beard === "short"
      ? `<path d="M77 ${cy + 2} Q79 ${cy + 27} 100 ${cy + 32} Q121 ${cy + 27} 123 ${cy + 2} Q119 ${cy + 18} 110 ${cy + 21} Q100 ${cy + 24} 90 ${cy + 21} Q81 ${cy + 18} 77 ${cy + 2}Z" fill="${hair}" opacity=".55"/>`
      : `<path d="M76 ${cy} Q77 ${cy + 30} 100 ${cy + 35} Q123 ${cy + 30} 124 ${cy} Q120 ${cy + 17} 111 ${cy + 20} Q100 ${cy + 24} 89 ${cy + 20} Q80 ${cy + 17} 76 ${cy}Z" fill="${hair}"/>
         <path d="M80 ${cy + 6} Q84 ${cy + 26} 100 ${cy + 31}" stroke="#000" stroke-opacity=".25" stroke-width="1.2" fill="none"/>`;
    return `
      <ellipse cx="100" cy="${cy}" rx="24" ry="30" fill="url(#skin)"/>
      <path d="M78 ${cy + 4} Q82 ${cy + 26} 100 ${cy + 30} Q118 ${cy + 26} 122 ${cy + 4} Q118 ${cy + 22} 100 ${cy + 26} Q82 ${cy + 22} 78 ${cy + 4}Z" fill="${s[1]}" opacity=".35"/>
      ${beard}
      <path d="M86 ${cy + 13} Q100 ${cy + 7} 114 ${cy + 13} Q107 ${cy + 16} 100 ${cy + 14} Q93 ${cy + 16} 86 ${cy + 13}Z" fill="${hair}"/>
      <path d="M92 ${cy + 19} Q100 ${cy + 22} 108 ${cy + 19} Q100 ${cy + 24.5} 92 ${cy + 19}Z" fill="#8a4a38"/>
      <path d="M100 ${cy - 8} Q97 ${cy + 3} 94.5 ${cy + 7} Q100 ${cy + 10} 105.5 ${cy + 7}" stroke="${s[1]}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="96.5" cy="${cy + 7}" rx="1.6" ry="1" fill="#5a3320" opacity=".6"/><ellipse cx="103.5" cy="${cy + 7}" rx="1.6" ry="1" fill="#5a3320" opacity=".6"/>
      <g>
        <ellipse cx="89" cy="${cy - 8}" rx="5.4" ry="3.3" fill="#fbf7f0"/><ellipse cx="111" cy="${cy - 8}" rx="5.4" ry="3.3" fill="#fbf7f0"/>
        <circle cx="89.6" cy="${cy - 7.8}" r="2.7" fill="#4a2d17"/><circle cx="110.4" cy="${cy - 7.8}" r="2.7" fill="#4a2d17"/>
        <circle cx="89.6" cy="${cy - 7.8}" r="1.3" fill="#0b0705"/><circle cx="110.4" cy="${cy - 7.8}" r="1.3" fill="#0b0705"/>
        <circle cx="90.6" cy="${cy - 8.8}" r=".8" fill="#fff"/><circle cx="111.4" cy="${cy - 8.8}" r=".8" fill="#fff"/>
        <path d="M83.4 ${cy - 9.4} Q89 ${cy - 13} 94.6 ${cy - 9.4}" stroke="#2a1a10" stroke-width="1.4" fill="none"/>
        <path d="M105.4 ${cy - 9.4} Q111 ${cy - 13} 116.6 ${cy - 9.4}" stroke="#2a1a10" stroke-width="1.4" fill="none"/>
      </g>
      <path d="M81.5 ${cy - 16} Q89 ${cy - 20.5} 96 ${cy - 16.5}" stroke="${hair}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M104 ${cy - 16.5} Q111 ${cy - 20.5} 118.5 ${cy - 16}" stroke="${hair}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  }
  function faceSide(o, cy = 80) { // facing left
    const s = SKIN[o.skin || "tan"], hair = HAIR[o.hair || "black"];
    const beard = o.beard === false ? "" : `<path d="M74 ${cy + 4} Q76 ${cy + 26} 94 ${cy + 32} L108 ${cy + 26} L106 ${cy + 6} Q96 ${cy + 16} 86 ${cy + 14} Q80 ${cy + 12} 74 ${cy + 4}Z" fill="${hair}" opacity="${o.beard === "short" ? .55 : 1}"/>`;
    return `
      <path d="M100 ${cy - 30} C84 ${cy - 30} 75 ${cy - 20} 74 ${cy - 8} L68 ${cy + 2} Q67 ${cy + 5} 73 ${cy + 7} L73 ${cy + 13} Q72 ${cy + 26} 92 ${cy + 31} L110 ${cy + 26} L112 ${cy - 26} Z" fill="url(#skin)"/>
      ${beard}
      <path d="M72 ${cy + 13} Q80 ${cy + 10} 86 ${cy + 14}" stroke="${hair}" stroke-width="3.5" fill="none"/>
      <path d="M74 ${cy + 20} Q78 ${cy + 21} 82 ${cy + 19}" stroke="#8a4a38" stroke-width="2" fill="none"/>
      <ellipse cx="82" cy="${cy - 8}" rx="3.3" ry="2.8" fill="#fbf7f0"/><circle cx="80.8" cy="${cy - 7.8}" r="2" fill="#2a1a10"/><circle cx="80.3" cy="${cy - 8.4}" r=".6" fill="#fff"/>
      <path d="M77 ${cy - 16} Q83 ${cy - 19} 89 ${cy - 16}" stroke="${hair}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M74 ${cy - 4} Q71 ${cy + 1} 72 ${cy + 4}" stroke="${s[1]}" stroke-width="1.5" fill="none"/>`;
  }

  // ---------- Emirati citizen: kandura, ghutra, agal ----------
  function citizen(o, dir, f) {
    const sw = f === 1 ? 1 : f === 2 ? -1 : 0, s = SKIN[o.skin || "tan"];
    const shadow = `<ellipse cx="100" cy="388" rx="50" ry="9" fill="#000" opacity=".22"/>`;
    if (dir === "down" || dir === "up") {
      const front = dir === "down";
      const feet = front
        ? `<g transform="translate(0 ${sw * 5})"><path d="M70 370 Q82 362 94 370 L96 386 Q83 392 68 386Z" fill="url(#sandal)"/><path d="M72 380 Q82 376 93 380 L94 388 Q83 391 71 388Z" fill="url(#skin)"/></g>
           <g transform="translate(0 ${-sw * 5})"><path d="M106 370 Q118 362 130 370 L132 386 Q117 392 104 386Z" fill="url(#sandal)"/><path d="M107 380 Q118 376 128 380 L129 388 Q117 391 106 388Z" fill="url(#skin)"/></g>`
        : `<path d="M72 ${376 - sw * 4} h22 v10 h-22z" fill="url(#sandal)"/><path d="M106 ${376 + sw * 4} h22 v10 h-22z" fill="url(#sandal)"/>`;
      const body = `<path d="M58 128 Q100 116 142 128 Q150 190 148 250 L${145 + sw * 2} 374 Q100 384 ${55 + sw * 2} 374 L52 250 Q50 190 58 128Z" fill="url(#kan)" stroke="#b9b3a3" stroke-width="1.2"/>
        <path d="M58 128 Q100 116 142 128 Q150 190 148 250 L${145 + sw * 2} 374 Q100 384 ${55 + sw * 2} 374 L52 250 Q50 190 58 128Z" fill="url(#kanV)"/>
        <path d="M84 170 Q80 270 ${78 + sw * 2} 372" stroke="#dcd8cc" stroke-width="3" fill="none"/><path d="M118 170 Q121 270 ${123 + sw * 2} 372" stroke="#dcd8cc" stroke-width="3" fill="none"/>
        <path d="M100 250 Q101 320 ${100 + sw} 378" stroke="#e8e5dc" stroke-width="2" fill="none"/>`;
      const arm = (side) => {
        const L = side < 0, x0 = L ? 58 : 142, rot = (L ? 1 : -1) * sw * 6;
        const p = L ? "M60 132 Q44 140 41 204 L39 254 Q49 262 60 256 L66 200 Z" : "M140 132 Q156 140 159 204 L161 254 Q151 262 140 256 L134 200 Z";
        const hx = L ? 49 : 151;
        return `<g transform="rotate(${rot} ${x0} 132)"><path d="${p}" fill="url(#kan)" stroke="#b9b3a3" stroke-width="1.2"/>
          <path d="${L ? "M50 170 Q46 210 46 250" : "M150 170 Q154 210 154 250"}" stroke="#dcd8cc" stroke-width="2.5" fill="none"/>
          ${front ? `<ellipse cx="${hx}" cy="266" rx="9.5" ry="12.5" fill="url(#skin)"/>` : `<ellipse cx="${hx}" cy="264" rx="9" ry="11" fill="${s[1]}"/>`}</g>`;
      };
      if (front) {
        return svg(o, `${shadow}${feet}${arm(-1)}${arm(1)}${body}
          <rect x="88" y="100" width="24" height="30" rx="9" fill="${s[1]}"/>
          <path d="M86 124 Q100 136 114 124 L114 130 Q100 142 86 130Z" fill="#e9e6dd"/>
          <path d="M100 134 L100 212" stroke="#efece4" stroke-width="3"/><path d="M96.5 210 Q100 232 103.5 210Z" fill="#e5e1d6" stroke="#cfcab9"/>
          <path d="M100 12 C66 12 60 44 62 76 C60 104 53 140 50 174 Q64 182 79 182 C80 150 80 124 84 104 L116 104 C120 124 120 150 121 182 Q136 182 150 174 C147 140 140 104 138 76 C140 44 134 12 100 12Z" fill="url(#ghu)" stroke="#c9c4b4" stroke-width="1.3"/>
          <path d="M64 92 Q60 130 58 172" stroke="#e2ded2" stroke-width="3" fill="none"/><path d="M136 92 Q140 130 142 172" stroke="#e2ded2" stroke-width="3" fill="none"/>
          <path d="M72 100 Q70 140 70 178" stroke="#ebe8df" stroke-width="2" fill="none"/><path d="M128 100 Q130 140 130 178" stroke="#ebe8df" stroke-width="2" fill="none"/>
          ${faceFront(o, 82)}
          <path d="M73 60 Q100 44 127 60 Q122 54 100 50 Q78 54 73 60Z" fill="#fff" stroke="#d2cdbf" stroke-width="1"/>
          <path d="M72 62 Q100 50 128 62" stroke="#d8d3c5" stroke-width="1.4" fill="none"/>
          <ellipse cx="100" cy="35" rx="33" ry="8.5" fill="none" stroke="#141414" stroke-width="5.5"/>
          <ellipse cx="100" cy="42" rx="34.5" ry="9" fill="none" stroke="#1e1e1e" stroke-width="5.5"/>
          <path d="M70 34 Q100 25 130 34" stroke="#555" stroke-width="1.2" fill="none" opacity=".7"/>`);
      }
      return svg(o, `${shadow}${feet}${body}${arm(-1)}${arm(1)}
        <path d="M100 12 C66 12 60 44 62 76 C58 120 54 170 58 216 Q100 230 142 216 C146 170 142 120 138 76 C140 44 134 12 100 12Z" fill="url(#ghu)" stroke="#c9c4b4" stroke-width="1.3"/>
        <path d="M100 60 L100 222" stroke="#e4e0d5" stroke-width="2.5"/><path d="M86 70 Q80 150 74 220" stroke="#e7e3d9" stroke-width="2.5" fill="none"/><path d="M114 70 Q120 150 126 220" stroke="#e7e3d9" stroke-width="2.5" fill="none"/>
        <ellipse cx="100" cy="35" rx="33" ry="8.5" fill="none" stroke="#141414" stroke-width="5.5"/>
        <ellipse cx="100" cy="42" rx="34.5" ry="9" fill="none" stroke="#1e1e1e" stroke-width="5.5"/>
        <path d="M96 48 Q94 80 95 112" stroke="#151515" stroke-width="3" fill="none"/><path d="M104 48 Q106 80 105 112" stroke="#151515" stroke-width="3" fill="none"/>
        <path d="M92 112 Q95 124 98 112Z" fill="#151515"/><path d="M102 112 Q105 124 108 112Z" fill="#151515"/>`);
    }
    // side (left); right is mirrored
    const legA = sw * 12;
    const inner = `${shadow}
      <path d="M${70 - legA} 372 Q${84 - legA} 364 ${98 - legA} 372 L${98 - legA} 386 Q${84 - legA} 390 ${66 - legA} 386Z" fill="url(#sandal)"/>
      <path d="M${102 + legA} 372 Q${116 + legA} 364 ${130 + legA} 372 L${130 + legA} 386 Q${116 + legA} 390 ${98 + legA} 386Z" fill="url(#sandal)" opacity=".85"/>
      <path d="M76 130 Q104 118 130 132 Q138 200 136 252 L${136 + sw * 4} 374 Q102 382 ${68 - sw * 4} 374 L72 252 Q70 190 76 130Z" fill="url(#kan)" stroke="#b9b3a3" stroke-width="1.2"/>
      <path d="M76 130 Q104 118 130 132 Q138 200 136 252 L${136 + sw * 4} 374 Q102 382 ${68 - sw * 4} 374 L72 252 Q70 190 76 130Z" fill="url(#kanV)"/>
      <path d="M96 170 Q92 270 ${90 - sw * 3} 374" stroke="#dcd8cc" stroke-width="3" fill="none"/>
      <rect x="90" y="100" width="20" height="30" rx="8" fill="${s[1]}"/>
      <path d="M92 12 C120 10 138 34 136 76 C138 120 142 170 134 216 L114 210 C114 160 112 120 108 104 L106 62 C98 52 88 52 78 56 C76 30 80 14 92 12Z" fill="url(#ghu)" stroke="#c9c4b4" stroke-width="1.3"/>
      <path d="M120 70 Q126 140 124 210" stroke="#e4e0d5" stroke-width="2.5" fill="none"/>
      ${faceSide(o, 82)}
      <path d="M76 58 Q90 50 108 56" stroke="#d6d1c3" stroke-width="2" fill="none"/>
      <ellipse cx="104" cy="36" rx="30" ry="7" fill="none" stroke="#141414" stroke-width="5.5"/>
      <ellipse cx="104" cy="43" rx="31" ry="7.5" fill="none" stroke="#1e1e1e" stroke-width="5.5"/>
      <path d="M130 46 Q136 80 134 110" stroke="#151515" stroke-width="3" fill="none"/>
      <g transform="rotate(${-sw * 14} 104 134)"><path d="M98 134 Q90 150 90 204 L92 254 Q101 260 110 254 L114 200 Q114 150 110 134Z" fill="url(#kan)" stroke="#b9b3a3" stroke-width="1.2"/>
      <ellipse cx="101" cy="265" rx="9" ry="12" fill="url(#skin)"/></g>`;
    return svg(o, dir === "right" ? mirror(inner) : inner);
  }

  // ---------- uniformed figure (officer or prisoner) ----------
  function uniformed(o, dir, f) {
    const sw = f === 1 ? 1 : f === 2 ? -1 : 0, s = SKIN[o.skin || "tan"], u = UNI[o.uni || "admin"], hair = HAIR[o.hair || "black"];
    const isP = o.uni === "prisoner";
    const shoeFill = isP ? "#3a3a3a" : "url(#shoe)";
    const shadow = `<ellipse cx="100" cy="388" rx="46" ry="9" fill="#000" opacity=".22"/>`;
    if (dir === "down" || dir === "up") {
      const front = dir === "down";
      const legs = `<g transform="translate(0 ${sw * 5})"><path d="M66 238 L99 238 L97 372 L73 372Z" fill="url(#leg)"/><path d="M84 250 L84 370" stroke="${u.d}" stroke-width="1.5"/>
          <path d="M70 368 Q85 362 99 368 L100 384 Q84 392 68 386Z" fill="${shoeFill}"/>${front && !isP ? `<ellipse cx="82" cy="373" rx="6" ry="2" fill="#fff" opacity=".25"/>` : ""}</g>
        <g transform="translate(0 ${-sw * 5})"><path d="M101 238 L134 238 L127 372 L103 372Z" fill="url(#leg)"/><path d="M116 250 L116 370" stroke="${u.d}" stroke-width="1.5"/>
          <path d="M101 368 Q115 362 130 368 L132 386 Q116 392 100 384Z" fill="${shoeFill}"/>${front && !isP ? `<ellipse cx="118" cy="373" rx="6" ry="2" fill="#fff" opacity=".25"/>` : ""}</g>`;
      const arm = (side) => {
        const L = side < 0, x0 = L ? 62 : 138, rot = (L ? 1 : -1) * sw * 7;
        const p = L ? "M64 130 Q46 138 43 200 L42 246 Q52 254 62 248 L68 196 Z" : "M136 130 Q154 138 157 200 L158 246 Q148 254 138 248 L132 196 Z";
        const hx = L ? 52 : 148;
        const patch = !isP && front ? `<path d="M${L ? 46 : 144} 150 l5 -2.5 l5 2.5 v7 q-.8 5 -5 6.5 q-4.2 -1.5 -5 -6.5z" fill="#ffffff"/><path d="M${L ? 48.5 : 146.5} 152 l2.5 -1 l2.5 1 v4 q-.5 3 -2.5 3.8 q-2 -.8 -2.5 -3.8z" fill="#135BA6"/>` : "";
        return `<g transform="rotate(${rot} ${x0} 132)"><path d="${p}" fill="url(#uni)"/>${patch}
          ${!isP ? `<path d="M${L ? 43 : 147} 238 h${L ? 19 : 11} v6 h-${L ? 19 : 11}z" fill="${u.d}"/>` : ""}
          <ellipse cx="${hx}" cy="258" rx="9.5" ry="12" fill="${front ? "url(#skin)" : s[1]}"/></g>`;
      };
      const torso = front ? `
        <path d="M62 126 Q100 114 138 126 Q144 160 140 242 L60 242 Q56 160 62 126Z" fill="url(#uni)"/>
        ${isP ? `<rect x="108" y="150" width="22" height="14" fill="#fff" opacity=".9"/><text x="119" y="161" font-family="Arial" font-size="9" font-weight="700" text-anchor="middle" fill="#222">${o.num || "0417"}</text>
                <path d="M100 136 L100 242" stroke="${u.d}" stroke-width="2"/>`
              : `<path d="M100 134 L100 236" stroke="${u.d}" stroke-width="2.2"/>
                ${[150, 172, 194, 216].map((y) => `<circle cx="100" cy="${y}" r="2.3" fill="#c9ced6"/>`).join("")}
                <path d="M70 148 h22 v24 h-22z" fill="none" stroke="${u.d}" stroke-width="1.8"/><path d="M70 148 h22 l-2 7 h-18z" fill="${u.d}"/><circle cx="81" cy="153" r="1.6" fill="#c9ced6"/>
                <path d="M108 148 h22 v24 h-22z" fill="none" stroke="${u.d}" stroke-width="1.8"/><path d="M108 148 h22 l-2 7 h-18z" fill="${u.d}"/>
                <rect x="109" y="140" width="21" height="6" rx="1" fill="#eef1f5"/><rect x="111" y="142" width="13" height="2" fill="#1b2f57"/>
                <path d="M62 126 L86 119 L88 128 L64 135Z" fill="${u.d}"/><path d="M138 126 L114 119 L112 128 L136 135Z" fill="${u.d}"/>
                <circle cx="72" cy="127" r="2.4" fill="#d8dde5"/><circle cx="79" cy="125" r="2.4" fill="#d8dde5"/><circle cx="128" cy="127" r="2.4" fill="#d8dde5"/><circle cx="121" cy="125" r="2.4" fill="#d8dde5"/>
                <rect x="61" y="230" width="78" height="12" fill="#111"/><rect x="93" y="228.5" width="14" height="15" rx="2" fill="#c9ced6" stroke="#8a95a5"/>`}
        <rect x="89" y="100" width="22" height="28" rx="8" fill="${s[1]}"/>
        <path d="M84 120 L100 138 L116 120 L120 128 L100 146 L80 128Z" fill="${u.l}"/>`
        : `<path d="M62 126 Q100 114 138 126 Q144 160 140 242 L60 242 Q56 160 62 126Z" fill="url(#uni)"/>
           <path d="M74 140 Q100 150 126 140" stroke="${u.d}" stroke-width="2" fill="none"/>
           ${!isP ? `<rect x="61" y="230" width="78" height="12" fill="#111"/><path d="M62 126 L86 119 L88 128 L64 135Z" fill="${u.d}"/><path d="M138 126 L114 119 L112 128 L136 135Z" fill="${u.d}"/>` : `<text x="100" y="190" font-family="Arial" font-size="16" font-weight="800" text-anchor="middle" fill="#fff" opacity=".85">KSH</text>`}
           <rect x="89" y="100" width="22" height="28" rx="8" fill="${s[1]}"/><path d="M84 120 Q100 128 116 120 L118 130 Q100 138 82 130Z" fill="${u.l}"/>`;
      const head = front ? `
        <ellipse cx="76" cy="84" rx="5" ry="9" fill="${s[1]}"/><ellipse cx="124" cy="84" rx="5" ry="9" fill="${s[1]}"/>
        ${faceFront(o, 82)}
        <path d="M76 72 Q75 52 100 49 Q125 52 124 72 L121 62 Q100 55 79 62Z" fill="${hair}"/>
        ${isP ? `<path d="M74 66 Q72 44 100 42 Q128 44 126 66 Q114 54 100 56 Q86 54 74 66Z" fill="${hair}"/>`
              : `<path d="M68 60 C58 40 82 20 112 22 C140 24 152 40 142 56 C128 50 96 48 68 60Z" fill="url(#beret)"/>
                 <path d="M70 60 Q100 50 132 55" stroke="#000" stroke-opacity=".6" stroke-width="4.5" fill="none"/>
                 <path d="M82 37 l7.5 -3.5 l7.5 3.5 v7 q-1 6.5 -7.5 8.5 q-6.5 -2 -7.5 -8.5z" fill="#d9dee6" stroke="#8c97a7" stroke-width="1"/>
                 <path d="M86 40 l3.5 -1.6 l3.5 1.6 v3.4 q-.5 3 -3.5 4 q-3 -1 -3.5 -4z" fill="#135BA6"/>`}`
        : `<ellipse cx="76" cy="84" rx="5" ry="9" fill="${s[1]}"/><ellipse cx="124" cy="84" rx="5" ry="9" fill="${s[1]}"/>
           <ellipse cx="100" cy="80" rx="24" ry="30" fill="${hair}"/><path d="M80 98 Q100 112 120 98 Q118 110 100 112 Q82 110 80 98Z" fill="${s[1]}"/>
           ${isP ? "" : `<path d="M60 58 C56 36 84 22 110 24 C138 26 150 42 140 58 C120 52 84 52 60 58Z" fill="url(#beret)"/><path d="M64 60 Q100 52 136 58" stroke="#000" stroke-opacity=".6" stroke-width="4.5" fill="none"/>`}`;
      return svg(o, `${shadow}${legs}${arm(-1)}${arm(1)}${torso}${head}`);
    }
    // side, facing left
    const a = sw * 13;
    const inner = `${shadow}
      <path d="M${86 - a} 238 L${110 - a} 238 L${104 - a * 1.4} 372 L${84 - a * 1.4} 372Z" fill="url(#leg)"/>
      <path d="M${80 - a * 1.4} 368 Q${92 - a * 1.4} 362 ${106 - a * 1.4} 370 L${106 - a * 1.4} 384 Q${88 - a * 1.4} 390 ${68 - a * 1.4} 384Z" fill="${shoeFill}"/>
      <path d="M${92 + a} 238 L${116 + a} 238 L${118 + a * 1.4} 372 L${98 + a * 1.4} 372Z" fill="url(#leg)" opacity=".92"/>
      <path d="M${92 + a * 1.4} 368 Q${104 + a * 1.4} 362 ${118 + a * 1.4} 370 L${118 + a * 1.4} 384 Q${100 + a * 1.4} 390 ${80 + a * 1.4} 384Z" fill="${shoeFill}"/>
      <path d="M78 128 Q104 118 128 130 Q134 170 130 242 L78 242 Q72 170 78 128Z" fill="url(#uni)"/>
      ${!isP ? `<rect x="77" y="230" width="54" height="12" fill="#111"/><path d="M84 148 h16 v22 h-16z" fill="none" stroke="${u.d}" stroke-width="1.8"/><path d="M96 122 L114 124 L112 132 L96 130Z" fill="${u.d}"/>` : ""}
      <rect x="90" y="100" width="20" height="30" rx="8" fill="${s[1]}"/><path d="M84 122 L100 136 L114 124 L114 132 L100 144 L84 130Z" fill="${u.l}"/>
      <ellipse cx="106" cy="84" rx="5" ry="9" fill="${s[1]}"/>
      ${faceSide(o, 82)}
      <path d="M78 66 Q80 50 102 49 Q118 50 114 76 L108 70 Q104 60 86 62Z" fill="${hair}"/><path d="M100 54 Q114 56 112 90 Q108 76 100 70Z" fill="${hair}"/>
      ${isP ? `<path d="M76 66 Q76 44 104 42 Q124 46 116 72 Q106 56 76 66Z" fill="${hair}"/>`
            : `<path d="M72 58 C68 38 92 24 116 28 C134 32 136 48 128 60 C110 54 92 54 72 58Z" fill="url(#beret)"/><path d="M74 60 Q100 52 126 58" stroke="#000" stroke-opacity=".6" stroke-width="4.5" fill="none"/>`}
      <g transform="rotate(${-sw * 16} 104 132)"><path d="M96 132 Q88 150 88 200 L90 246 Q100 252 110 246 L112 198 Q112 150 110 132Z" fill="url(#uni)"/>
        ${!isP ? `<path d="M93 150 l5 -2.5 l5 2.5 v7 q-.8 5 -5 6.5 q-4.2 -1.5 -5 -6.5z" fill="#fff"/><path d="M95.5 152 l2.5 -1 l2.5 1 v4 q-.5 3 -2.5 3.8 q-2 -.8 -2.5 -3.8z" fill="#135BA6"/>` : ""}
        <ellipse cx="100" cy="257" rx="9" ry="11.5" fill="url(#skin)"/></g>`;
    return svg(o, dir === "right" ? mirror(inner) : inner);
  }

  function make(kind, o, dir, frame) {
    return kind === "citizen" ? citizen(o, dir, frame) : uniformed({ ...o, uni: kind === "prisoner" ? "prisoner" : o.uni }, dir, frame);
  }

  // Cache of decoded images: key -> HTMLImageElement
  const cache = new Map();
  function image(kind, o, dir, frame = 0) {
    const key = `${kind}|${JSON.stringify(o)}|${dir}|${frame}`;
    let img = cache.get(key);
    if (!img) {
      img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(make(kind, o, dir, frame));
      cache.set(key, img);
    }
    return img;
  }
  function preload(list) {
    const imgs = [];
    for (const [kind, o] of list) for (const d of ["down", "up", "left", "right"]) for (const f of [0, 1, 2]) imgs.push(image(kind, o, d, f));
    return Promise.all([...new Set(imgs)].map((i) => i.complete ? 0 : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); })));
  }
  window.KChars = { make, image, preload, SKIN, UNI };
})();
