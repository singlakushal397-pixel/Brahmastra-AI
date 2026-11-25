/**
 * Automated In-Character Dialogue Engine for Embers Free Fire Characters.
 * Works instantaneously without external API keys or server failures.
 * Uses each character's loaded profile, abilities, personality, and topic alignment
 * to generate concise, character-authentic responses and character summaries.
 */

const CHARACTER_VOICES = {
  alok: {
    greeting: (c) =>
      `Hey! I'm **DJ Alok** — music producer and frontline support legend. My signature skill **${c.skill}** projects a 5m energy aura that boosts squad speed and restores **5 HP/s** (with collectible music notes in Party Remix). Drop a topic—music, teamwork, motivation, or squad tactics—and let's catch the right rhythm!`,
    ability: (c) =>
      `When I trigger **${c.skill}**, a 5-meter blue energy ring lights up the arena—lifting squad movement speed (+15% demo / +10% OB patch) and healing **5 HP per second** for up to 10s, plus dropping music notes for allies. Every great squad fights better on the same beat!`,
    motivation:
      `Hey, don't let one rough round kill your groove! Take a breath, reset your tempo, and focus on the very next step—every setback is just the quiet build-up before your best drop.`,
    teamwork:
      `Great squads move like a live band. Everyone plays a different role, so call out enemy angles, stay inside the healing aura when pushing, and never leave a teammate off-beat!`,
    story: (c) =>
      `${c.biography} In short: I bring high-tempo energy, healing support, and squad unity wherever the zone closes.`,
    hinglish:
      `Arre dost, tension mat le! Apna rhythm pakad aur team ke saath move kar—**Drop the Beat** aura aur positive vibe ke saath har fight jeet sakte hain!`,
    fallback: (topic) =>
      `I hear you on "${topic}"! Just like producing a track, stay patient, keep your energy steady, and back up the people in your corner—that's how we turn pressure into a Booyah.`,
  },
  chrono: {
    greeting: (c) =>
      `Chrono online. I'm a tactical protector from an alternate universe. My signature ability **${c.skill}** deploys an impenetrable force-field dome blocking **800–1000 damage** from outside fire so my squad can regroup safely. State your objective or ask about strategy, defense, or technology.`,
    ability: (c) =>
      `**${c.skill}** generates a 360° holographic shield dome blocking **800–1000 incoming damage**. You cannot shoot outward from inside the dome, so use it smartly to revive allies, heal under cover, or reposition safely.`,
    motivation:
      `Pressure tests discipline. Pause, evaluate the variables you can control, and execute one calculated step at a time—acting without a plan creates unnecessary risk.`,
    teamwork:
      `Protection is the backbone of every winning squad. Hold your angles, deploy cover before teammates get caught in crossfire, and communicate rotations early.`,
    story: (c) =>
      `${c.biography} Summarized: calm tactical intelligence backed by advanced force-field shielding.`,
    hinglish:
      `Focus rakho aur jaldbazi mat karo. Sahi waqt par **Time Turner** shield aur smart strategy se kisi bhi mushkil situation ko control kiya ja sakta hai.`,
    fallback: (topic) =>
      `Regarding "${topic}"—assess the situation calmly first, protect what matters, and commit only when the timing is in your favor.`,
  },
  k: {
    greeting: (c) =>
      `Greetings. I am **K — Captain Booyah**, professor and jiu-jitsu master in the red long coat. My **${c.skill}** skill adds **+50 Max EP** (250 cap) and switches between **Jiu-jitsu Mode** (6m ally +500% EP-to-HP conversion) and **Psychology Mode** (steady EP recovery). What would you like to explore?`,
    ability: (c) =>
      `**${c.skill}** has two disciplined modes: **Jiu-jitsu Mode** boosts allies' EP-to-HP conversion rate by **500%** within 6m (official Garena profile), while **Psychology Mode** restores EP continuously over time up to 250 Max EP.`,
    motivation:
      `True strength begins with self-mastery. Motivation sparks the first step, but daily consistency and mental clarity carry you across the finish line.`,
    teamwork:
      `A disciplined squad manages resources together. Keep your EP topped up in Psychology Mode between rotations, then shift into Jiu-jitsu Mode when your squad engages so everyone sustains through the fight.`,
    story: (c) =>
      `${c.biography} In brief: a composed martial-arts professor balancing psychological endurance with frontline support.`,
    hinglish:
      `Sabr aur consistency sabse badi taqat hai. Apna dimaag shant rakho—**Master of All** ki tarah har situation mein sahi mode choose karo.`,
    fallback: (topic) =>
      `On "${topic}"—approach it with patience and structure. Small, deliberate improvements repeated consistently always outperform rushed effort.`,
  },
  kelly: {
    greeting: (c) =>
      `Hey there! I'm **Kelly** (Shimada Kiriko) — Bermuda's fastest track sprinter! My passive **Dash** boosts sprint speed by **+6%**, and Awakened **Deadly Velocity** empowers my first shot for **106% damage** after 4 seconds of sprinting. Ready to pick up the pace?`,
    ability: (c) =>
      `**Dash** keeps my sprinting speed **6% faster** all match, and once I sprint for 4 seconds, **Deadly Velocity** primes my first hit for **106% critical damage** during a 5-second window—perfect for fast flanks!`,
    motivation:
      `Keep moving forward! You don't have to be the fastest every single day—just keep showing up, run your own race, and every step brings your goal closer!`,
    teamwork:
      `Speed wins flanks! Let your team draw attention upfront while you sprint wide around cover to catch opponents off-guard before they can reset!`,
    story: (c) =>
      `${c.biography} Quick summary: energetic sprinter built for high-speed rotations and sharp opening shots.`,
    hinglish:
      `Rukna mana hai! Apni speed aur confidence high rakho—har kadam tumhe aage le jaata hai. Chalo **Deadly Velocity** ke saath full pace mein chalte hain!`,
    fallback: (topic) =>
      `Ooh, "${topic}"! Whatever challenge is in front of you, stay light on your feet, keep your momentum up, and never hesitate to take the first stride!`,
  },
  orion: {
    greeting: (c) =>
      `I am **Orion**. I traded ordinary EP for **300 Crimson Energy**. When I trigger **${c.skill}**, I enter a 3-second invulnerable crimson sphere while draining HP from enemies within 5m—ignoring their shields. Speak plainly—what do you seek?`,
    ability: (c) =>
      `**${c.skill}** swaps EP for **300 Crimson Energy** and consumes 150–200 energy to grant **3 seconds of damage immunity** while absorbing **10 HP/s** from nearby foes within 5m, bypassing shields.`,
    motivation:
      `Your past leaves scars, not chains. The hardest victory is learning to control what burns inside you instead of letting fear or regret steer your next move.`,
    teamwork:
      `Time Crimson Crush when enemy fire peaks—absorb the pressure, survive the burst, and create the opening your squad needs to finish the push.`,
    story: (c) =>
      `${c.biography} Summary: an intense survivor harnessing volatile Crimson Energy with iron self-control.`,
    hinglish:
      `Apne andar ki takat par control rakho. Ateet tumhe tod nahi sakta jab tak tum aaj apni ladai khud jeetne ka faisla rakhte ho.`,
    fallback: (topic) =>
      `About "${topic}"—stay composed under pressure. True strength isn't loud; it's holding your ground when everything tries to break you.`,
  },
  tatsuya: {
    greeting: (c) =>
      `Yo, I'm **Tatsuya** — street-born entry fragger built for explosive close-quarters pushes! My **${c.skill}** skill dashes forward in **0.3 seconds** (90s cooldown, resets if I knock an enemy within 10s). What angle are we breaking today?`,
    ability: (c) =>
      `**${c.skill}** lets me burst forward rapidly for **0.3 seconds** to snap aggressive close-range angles. Official cooldown is **90 seconds**, and knocking down an enemy within **10 seconds** after release resets it immediately!`,
    motivation:
      `Hesitate for half a second and the window closes. Trust your instincts, commit cleanly to your move, and keep pushing through the pressure!`,
    teamwork:
      `Never burn Rebel Rush blindly into the open—wait for your squad's call, dash across the blind angle, secure the knock within 10s for the cooldown reset, and keep pressure rolling!`,
    story: (c) =>
      `${c.biography} Summary: fearless street sprinter who breaks enemy formations with 0.3s neon dash bursts.`,
    hinglish:
      `Der mat kar! Ek sharp **Rebel Rush** dash aur 10 second ke andar knockdown—bas itna kaafi hai puri fight palatne ke liye!`,
    fallback: (topic) =>
      `On "${topic}"—keep your reflexes sharp and don't overthink. Pick your moment, commit fast, and own the pace!`,
  },
};

/**
 * Generates an automated, character-aligned reply using loaded character data.
 */
export function generateAutomatedReply(char, userMessage, history = []) {
  const msg = (userMessage || '').trim();
  const low = msg.toLowerCase();
  const voice = CHARACTER_VOICES[char.id];

  // 1. Check if visitor asks about their remembered name
  const prevMsgs = history.filter((m) => m.role === 'user').map((m) => m.text || m.content || '');
  const rememberedName = extractVisitorName([msg, ...prevMsgs.slice().reverse()]);

  const nameMatch = msg.match(/(?:my name is|i am|i'm|mera naam)\s+([A-Za-z][A-Za-z0-9_-]{1,24})/i);
  if (nameMatch) {
    const visitorName = nameMatch[1];
    return `${greetingPrefix(char)} Nice to meet you, **${visitorName}**! I'll keep that in mind while we talk. Ask me anything about my **${char.skill}** skill, Free Fire tactics, or just chat!`;
  }

  if (/(what.*my name|who am i|do you remember.*name|mera naam kya)/i.test(low)) {
    if (rememberedName) {
      return `Of course! You told me your name is **${rememberedName}**. How can I help you next?`;
    }
    return `You haven't told me your name yet! Tell me "My name is ..." and I'll remember it in our chat.`;
  }

  // 2. Configurable placeholder characters (Dialogue / Razoya)
  if (!voice || char.status === 'configurable_placeholder') {
    return `I'm **${char.displayName}** (${char.role}). ${char.tagline} Official lore and ability stats haven't been assigned yet—update \`characters/${char.id}/\` whenever you're ready!`;
  }

  // 3. Greeting -> Proper detailed character summary in character's voice
  if (/^(hi+|hello+|hey+|yo+|hola|namaste|sup|greetings|good\s*(morning|evening|afternoon|night))\b[!.\s?]*$/i.test(low)) {
    return voice.greeting(char);
  }

  // 4. Hinglish / Hindi query detection
  if (/\b(kaise|kya|bhai|yaar|naam|madad|batao|bata|shakti|tez|acha|theek|karo|hoon)\b/i.test(low)) {
    return voice.hinglish;
  }

  // 5. Ability / Skill / Cooldown / Mode questions
  if (/(ability|skill|power|aura|dash|shield|dome|ep|hp|cooldown|mode|jiu|psychology|drop the beat|time turner|master of all|deadly velocity|crimson|rebel rush|how.*work|stats)/i.test(low)) {
    return voice.ability(char);
  }

  // 6. Character summary / Bio / Outfit / Who are you
  if (/(who are you|about you|tell me about|summary|details|bio|story|outfit|jacket|coat|look|hair|world|background|describe)/i.test(low)) {
    return voice.story(char);
  }

  // 7. Motivation / Confidence / Mindset
  if (/(motivat|demotivat|sad|tired|give up|confiden|focus|consistency|mental|strength|past|fear|stress|win|goal)/i.test(low)) {
    return voice.motivation;
  }

  // 8. Teamwork / Squad / Strategy / Tips
  if (/(team|squad|friend|ally|allies|protect|strategy|tactic|tip|combo|rush|fight|booyah|play|improve)/i.test(low)) {
    return voice.teamwork;
  }

  // 9. Character-specific keywords (music for Alok, speed for Kelly, tech for Chrono, etc.)
  if (char.id === 'alok' && /(music|dj|beat|song|track|sound|rhythm)/i.test(low)) {
    return `Music is what connects the whole squad! When the beat drops, hesitation disappears—stay locked into your rhythm and keep your teammates moving together.`;
  }
  if (char.id === 'kelly' && /(speed|fast|run|sprint|track|race)/i.test(low)) {
    return `Speed isn't just sprinting in a straight line—it's timing your **Dash** around cover so **Deadly Velocity** lands that 106% opening strike before they even turn around!`;
  }
  if (char.id === 'chrono' && /(tech|future|protect|defense)/i.test(low)) {
    return `Technology is only as strong as the mind directing it. Deploy **Time Turner** with purpose—protect your team first, then seize the angle when the enemy reloads.`;
  }

  // 10. Topic-aligned concise character response referencing user's topic
  const shortTopic = msg.length > 60 ? `${msg.slice(0, 57)}...` : msg;
  return voice.fallback(shortTopic);
}

function greetingPrefix(char) {
  if (char.id === 'alok') return 'Awesome!';
  if (char.id === 'kelly') return 'Awesome!';
  if (char.id === 'chrono') return 'Acknowledged.';
  if (char.id === 'k') return 'Well met.';
  if (char.id === 'orion') return 'Understood.';
  return 'Got it!';
}

function extractVisitorName(messages) {
  for (const m of messages) {
    const match = m.match(/(?:my name is|i am|i'm|mera naam)\s+([A-Za-z][A-Za-z0-9_-]{1,24})/i);
    if (match) return match[1];
  }
  return null;
}
