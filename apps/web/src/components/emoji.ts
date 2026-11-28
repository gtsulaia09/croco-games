/**
 * Emoji for the chat picker, by category. Plain Unicode text (system emoji font, no images, no
 * library). Sequences joined with U+200D (🤷\u200D♂️, ❤️\u200D🔥) survive the server's text cleaning, which
 * keeps a joiner only between emoji.
 */
export interface EmojiCategory {
  id: string;
  icon: string;
  emoji: string[];
}

const split = (s: string) => s.trim().split(/\s+/);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    icon: "😀",
    emoji: split(`
      😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎
      🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥
      😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🫠 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵\u200D💫 🤐 🥴 🤢 🤮 🤧
      😷 🤒 🤕 🤑 🤠 😈 👿 🤡 💩 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊
    `),
  },
  {
    id: "gestures",
    icon: "👍",
    emoji: split(`
      👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐
      🤲 🤝 🙏 ✍️ 💪 🫡 🤷 🤷\u200D♂️ 🤷\u200D♀️ 🤦 🤦\u200D♂️ 🤦\u200D♀️ 🙋 🙋\u200D♂️ 🙋\u200D♀️ 🙇 🙇\u200D♂️ 🙇\u200D♀️ 💁 💁\u200D♂️ 💁\u200D♀️ 🙆 🙆\u200D♂️ 🙆\u200D♀️ 🙅 🙅\u200D♂️ 🙅\u200D♀️ 🧏 🙎 🙍
      👀 👁️ 👂 👃 👄 🧠 🫀 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👨\u200D💻 👩\u200D💻 🕵️ 👮 💂 🧙 🧛 🧟 🦸 🦹 🥷 💃 🕺
    `),
  },
  {
    id: "hearts",
    icon: "❤️",
    emoji: split(`
      ❤️ 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 🩷 💔 ❤️\u200D🔥 ❤️\u200D🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 😘 🥰 😍 🫶
      💐 🌹 🥀 🌷 🌸 💮 🌺 🌻 🌼 💫 ⭐ 🌟 ✨ 💥 💢 💦 💨 🕊️ 🌈 ☀️ 🌙 ⛅ 🌧️ ⛈️ ❄️ ☃️ 🔥 💧 🌊 🍀
    `),
  },
  {
    id: "games",
    icon: "🃏",
    emoji: split(`
      🃏 ♠️ ♥️ ♦️ ♣️ ♤ ♡ ♢ ♧ 🎴 🀄 🎲 🎯 🎰 🎮 🕹️ ♟️ 🧩 🏆 🥇 🥈 🥉 🏅 🎖️ 👑 💰 💵 💶 💷 💸
      🪙 💎 💯 🔥 ⚡ 🚀 🎉 🎊 ✅ ☑️ ❌ ❎ ⭕ 🛑 ⛔ 🚫 ❓ ❔ ❗ ❕ ‼️ ⁉️ ⏳ ⌛ ⏰ ⏱️ 🔔 🔕 📣 📢
      🍀 🧿 🪬 🔮 🎩 🪄 🧲 💡 🔑 🗝️ 🔒 🔓 📈 📉 📊 🆗 🆒 🆕 🆙 🔝 🔙 🔚 ➕ ➖ ✖️ ➗ 🟰 ♾️ 💤 🎵
    `),
  },
  {
    id: "food",
    icon: "🍷",
    emoji: split(`
      🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍩 🍪 🍯 🍦 🍨 🍧 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍎 🍏 🍐 🍊 🍋 🍌
      🍞 🥐 🥖 🫓 🧀 🥚 🍳 🥞 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥙 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍿 🥜
      ☕ 🍵 🧉 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾 🧊 🥄 🍴 🍽️ 🥢 🎁 🎈 🎀 🎆 🎇 🧨 🪅 🪩 🎤 🎸
    `),
  },
  {
    id: "animals",
    icon: "🐻",
    emoji: split(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻\u200D❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🦋
      🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪
      🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🐈 🐈\u200D⬛ 🐓 🦃 🦚 🦜 🦢 🦩 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐿️
    `),
  },
  {
    id: "flags",
    icon: "🇬🇪",
    emoji: split(`
      🇬🇪 🏁 🚩 🏳️ 🏴 🎌 🇺🇸 🇬🇧 🇪🇺 🇺🇦 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇵🇹 🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇵🇱 🇨🇿 🇸🇰 🇭🇺 🇷🇴 🇧🇬 🇬🇷 🇹🇷 🇦🇲 🇦🇿 🇰🇿
      🇺🇿 🇮🇱 🇸🇦 🇦🇪 🇪🇬 🇮🇳 🇨🇳 🇯🇵 🇰🇷 🇹🇭 🇻🇳 🇮🇩 🇦🇺 🇳🇿 🇨🇦 🇲🇽 🇧🇷 🇦🇷 🇨🇱 🇨🇴 🇿🇦 🇳🇬 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇮🇪 🇱🇹 🇱🇻 🇪🇪
    `),
  },
];
