/**
 * The extension's copy of src/memory/redact.ts: strip known secret and personal-data formats from
 * a reply BEFORE it leaves the browser. laya.js calls this on every request and refuses to send
 * if it is missing.
 *
 * It is a port, not an import, because the extension ships plain files and the npm package does
 * not ship the extension. tests/scrub-parity.test.ts runs both over one corpus and fails on any
 * difference, so the two cannot drift. Change both together.
 *
 * Shapes, not judgement: a name, an address or a health detail written in prose is not caught.
 */
(function () {
  // The BIP39 English word list (2048 words), the same list as src/memory/bip39.ts. tests/scrub-bip39.test.ts
  // compares the two. A run of 12 or more consecutive words from it is a seed phrase and is removed.
  const BIP39_ENGLISH = [
  'abandon ability able about above absent absorb abstract absurd abuse access accident account',
  'accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict',
  'address adjust admit adult advance advice aerobic affair afford afraid again age agent agree',
  'ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha',
  'already also alter always amateur amazing among amount amused analyst anchor ancient anger',
  'angle angry animal ankle announce annual another answer antenna antique anxiety any apart',
  'apology appear apple approve april arch arctic area arena argue arm armed armor army around',
  'arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume',
  'asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn',
  'average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag',
  'balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle',
  'beach bean beauty because become beef before begin behave behind believe below belt bench',
  'benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black',
  'blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat',
  'body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket',
  'brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken',
  'bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle',
  'bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage',
  'cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital',
  'captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog',
  'catch category cattle caught cause caution cave ceiling celery cement census century cereal',
  'certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef',
  'cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar',
  'cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client',
  'cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach',
  'coast coconut code coffee coil coin collect color column combine come comfort comic common',
  'company concert conduct confirm congress connect consider control convince cook cool copper',
  'copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack',
  'cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp',
  'critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube',
  'culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp',
  'dance danger daring dash daughter dawn day deal debate debris decade december decide decline',
  'decorate decrease deer defense define defy degree delay deliver demand demise denial dentist',
  'deny depart depend deposit depth deputy derive describe desert design desk despair destroy',
  'detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital',
  'dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder',
  'display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate',
  'donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill',
  'drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle',
  'early earn earth easily east easy echo ecology economy edge edit educate effort egg eight',
  'either elbow elder electric elegant element elephant elevator elite else embark embody embrace',
  'emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce',
  'engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope',
  'episode equal equip era erase erode erosion error erupt escape essay essence estate eternal',
  'ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute',
  'exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express',
  'extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan',
  'fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee',
  'feed feel female fence festival fetch fever few fiber fiction field figure file film filter',
  'final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat',
  'flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold',
  'follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile',
  'frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace',
  'fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp',
  'gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle',
  'ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow',
  'glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant',
  'grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide',
  'guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat',
  'have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high',
  'hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn',
  'horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt',
  'hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image',
  'imitate immense immune impact impose improve impulse inch include income increase index',
  'indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate',
  'inner innocent input inquiry insane insect inside inspire install intact interest into invest',
  'invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly',
  'jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep',
  'ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock',
  'know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava',
  'law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon',
  'lend length lens leopard lesson letter level liar liberty library license life lift light like',
  'limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely',
  'long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine',
  'mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple',
  'marble march margin marine market marriage mask mass master match material math matrix matter',
  'maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention',
  'menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind',
  'minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify',
  'mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor',
  'mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual',
  'myself mystery myth naive name napkin narrow nasty nation nature near neck need negative',
  'neglect neither nephew nerve nest net network neutral never news next nice night noble noise',
  'nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut',
  'oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office',
  'often oil okay old olive olympic omit once one onion online only open opera opinion oppose',
  'option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor',
  'outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace',
  'palm panda panel panic panther paper parade parent park parrot party pass patch path patient',
  'patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people',
  'pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig',
  'pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please',
  'pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion',
  'position possible post potato pottery poverty powder power practice praise predict prefer',
  'prepare present pretty prevent price pride primary print priority prison private prize problem',
  'process produce profit program project promote proof property prosper protect proud provide',
  'public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put',
  'puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack',
  'radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw',
  'razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect',
  'reform refuse region regret regular reject relax release relief rely remain remember remind',
  'remove render renew rent reopen repair repeat replace report require rescue resemble resist',
  'resource response result retire retreat return reunion reveal review reward rhythm rib ribbon',
  'rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast',
  'robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude',
  'rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same',
  'sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school',
  'science scissors scorpion scout scrap screen script scrub sea search season seat second secret',
  'section security seed seek segment select sell seminar senior sense sentence series service',
  'session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine',
  'ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick',
  'side siege sight sign silent silk silly silver similar simple since sing siren sister situate',
  'six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight',
  'slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap',
  'soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort',
  'soul sound soup source south space spare spatial spawn speak special speed spell spend sphere',
  'spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy',
  'square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak',
  'steel stem step stereo stick still sting stock stomach stone stool story stove strategy street',
  'strike strong struggle student stuff stumble style subject submit subway success such sudden',
  'suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge',
  'surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing',
  'switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target',
  'task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme',
  'then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger',
  'tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet',
  'token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise',
  'toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash',
  'travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true',
  'truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty',
  'twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair',
  'unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade',
  'uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum',
  'vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture',
  'venue verb verify version very vessel veteran viable vibrant vicious victory video view village',
  'vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote',
  'voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave',
  'way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what',
  'wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner',
  'winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth',
  'wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo'
  ].join(' ');
  const SECRET = /sb_secret_[^\s]+/g;
  const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
  const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s]+/gi;
  const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
  const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/g;
  const EYJ = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/g;
  const SK = /\bsk-[A-Za-z0-9_\-]+/g;
  const STRIPE = /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}\b/g;
  const AWS_KEY_ID = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g;
  const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{35}\b/g;
  const GOOGLE_OAUTH = /\bya29\.[A-Za-z0-9_-]{10,}/g;
  const EXTENDED_KEY = /\b(?:[xyzutv](?:prv|pub)|Ltpv|Ltub|Mtpv|Mtub)[1-9A-HJ-NP-Za-km-z]{80,}\b/g;
  /** Bitcoin WIF private keys, base58: `5`/`9` + 50 characters (uncompressed) or `K`/`L`/`c` + 51 (compressed). */
  const WIF_KEY = /\b(?:[59][1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51})\b/g;
  /** A Solana secret key in base58: 86 to 90 base58 characters standing alone (a keypair is 64 bytes). */
  const SOLANA_BASE58 = /\b[1-9A-HJ-NP-Za-km-z]{86,90}\b/g;
  const SOLANA_KEYPAIR = /\[\s*\d{1,3}(?:\s*,\s*\d{1,3}){63}\s*\]/g;
  const AWS_SECRET_BARE = /(?<![A-Za-z0-9/+=_-])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=_-])/g;
  const GHP = /\bghp_[A-Za-z0-9]{36,}\b/g;
  const GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]+\b/g;
  const HF = /\bhf_[A-Za-z0-9_-]{8,}\b/g;
  const WEBHOOK_URL = /\bhttps:\/\/(?:hooks\.slack\.com\/services|(?:discord|discordapp)\.com\/api\/webhooks)\/[^\s]+/gi;
  const CREDENTIAL_ASSIGNMENT =
    /\b((?:[A-Za-z0-9]{1,20}[_-]){0,4}(?:password|passwd|pwd|secret|api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|session[_-]?token|client[_-]?secret|webhook[_-]?secret|signing[_-]?secret|secret[_-]?key|private[_-]?key|aws_secret_access_key))(["']?)(\s*[=:]\s*)(["']?)[^\s"',;]{6,}\4/gi;
  const HEX_64 = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;
  const PREFIXED_TOKENS = /\b(?:pypi-|npm_|hf_|whsec_|glsoat-|glagent-|glptt-|gloas-|glrt-|gldt-|glpat-|ghs_|ghr_|ghu_|gho_|xoxc-|xoxs-|xoxr-|xoxe-|xoxa-|xoxp-|xoxb-)[A-Za-z0-9_-]{8,}\b/g;
  // Bounded by the limits of an address (local part 64, domain 253, top-level label 63); the unbounded form was
  // quadratic on a long run with no `@`, and this runs on the page's main thread (see EMAIL in src/memory/redact.ts).
  const EMAIL = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}\b/g;
  const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
  const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
  const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
  const IBAN_CANDIDATE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

  function luhnValid(digits) {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  }

  function ibanValid(candidate) {
    const s = candidate.replace(/ /g, '');
    if (s.length < 15 || s.length > 34) return false;
    const moved = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of moved) {
      const code = ch.charCodeAt(0);
      const value = code >= 65 && code <= 90 ? String(code - 55) : ch;
      for (const digit of value) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
  }

  let bip39Set = null;
  const bip39 = () => bip39Set || (bip39Set = new Set(BIP39_ENGLISH.split(' ')));
  const MNEMONIC_MIN_WORDS = 12;

  // Remove each run of 12 or more consecutive BIP39 words (see stripMnemonics in src/memory/redact.ts).
  function stripMnemonics(text) {
    const words = [...text.matchAll(/[A-Za-z]+/g)];
    if (words.length < MNEMONIC_MIN_WORDS) return text;
    const set = bip39();
    const cuts = [];
    let runStart = -1;
    let runLen = 0;
    const close = (endIdx) => {
      if (runLen >= MNEMONIC_MIN_WORDS) {
        const first = words[runStart];
        const last = words[endIdx];
        const from = Math.max(0, first.index - 16);
        const lead = /\d{1,2}[.):]?[\s,;]*$/.exec(text.slice(from, first.index));
        cuts.push([lead ? from + lead.index : first.index, last.index + last[0].length]);
      }
      runStart = -1;
      runLen = 0;
    };
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const inList = w[0].length >= 3 && w[0].length <= 8 && set.has(w[0].toLowerCase());
      const gapOk = runStart >= 0 && /^[\s,;]+(?:\d{1,2}[.):]?[\s,;]*)?$/.test(text.slice(words[i - 1].index + words[i - 1][0].length, w.index));
      if (inList && (runStart < 0 || gapOk)) {
        if (runStart < 0) runStart = i;
        runLen++;
      } else {
        if (runStart >= 0) close(i - 1);
        if (inList) {
          runStart = i;
          runLen = 1;
        }
      }
    }
    if (runStart >= 0) close(words.length - 1);
    if (cuts.length === 0) return text;
    let out = '';
    let at = 0;
    for (const [a, b] of cuts) {
      out += text.slice(at, a);
      at = b;
    }
    return out + text.slice(at);
  }

  function isByteArray(candidate) {
    return candidate.match(/\d+/g).every((n) => Number(n) <= 255);
  }

  function isBareAwsSecret(candidate) {
    if (/^[0-9a-fA-F]{40}$/.test(candidate)) return false;
    return /[a-z]/.test(candidate) && /[A-Z]/.test(candidate) && /[0-9/+]/.test(candidate);
  }

  function redact(value) {
    return stripMnemonics(String(value == null ? '' : value)
      .replace(PEM_PRIVATE_KEY, '')
      .replace(SECRET, '')
      .replace(DB_URL, '')
      .replace(WEBHOOK_URL, '')
      .replace(BEARER, '')
      .replace(EYJ, '')
      .replace(SK, '')
      .replace(STRIPE, '')
      .replace(AWS_KEY_ID, '')
      .replace(GOOGLE_API_KEY, '')
      .replace(GOOGLE_OAUTH, '')
      .replace(GHP, '')
      .replace(GITHUB_PAT, '')
      .replace(HF, '')
      .replace(PREFIXED_TOKENS, '')
      .replace(EXTENDED_KEY, '')
      .replace(WIF_KEY, '')
      .replace(CREDENTIAL_ASSIGNMENT, '$1$2$3')
      .replace(HEX_64, '')
      .replace(AWS_SECRET_BARE, (m) => (isBareAwsSecret(m) ? '' : m))
      .replace(SOLANA_KEYPAIR, (m) => (isByteArray(m) ? '' : m))
      .replace(SOLANA_BASE58, '')
      .replace(ADDRESS, '')
      .replace(EMAIL, '')
      .replace(SSN, '')
      .replace(IBAN_CANDIDATE, (m) => (ibanValid(m) ? '' : m))
      .replace(CARD_CANDIDATE, (m) => {
        const digits = m.replace(/[ -]/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '' : m;
      })
      .replace(PHONE, ''));
  }

  const api = { redact };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellScrub = api;
})();
