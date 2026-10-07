/* Kampung Watch — static reference data and demo seed content.
   Everything here is sample data for the prototype; app.js copies the seed
   into localStorage on first visit. */
window.KW = window.KW || {};

KW.VERSION = 1;

/* Approximate town centres, used to place reports on the Scam Radar map. */
KW.TOWNS = {
  'Ang Mo Kio': [1.3691, 103.8454],
  'Bedok': [1.3236, 103.9273],
  'Bishan': [1.3526, 103.8352],
  'Bukit Batok': [1.3590, 103.7637],
  'Bukit Merah': [1.2819, 103.8239],
  'Choa Chu Kang': [1.3840, 103.7470],
  'Clementi': [1.3162, 103.7649],
  'Geylang': [1.3201, 103.8918],
  'Hougang': [1.3612, 103.8863],
  'Jurong West': [1.3404, 103.7090],
  'Pasir Ris': [1.3721, 103.9474],
  'Punggol': [1.3984, 103.9072],
  'Queenstown': [1.2942, 103.7861],
  'Sembawang': [1.4491, 103.8185],
  'Sengkang': [1.3868, 103.8914],
  'Serangoon': [1.3554, 103.8679],
  'Tampines': [1.3496, 103.9568],
  'Toa Payoh': [1.3343, 103.8563],
  'Woodlands': [1.4382, 103.7890],
  'Yishun': [1.4304, 103.8354]
};

KW.SCAM_TYPES = [
  'Fake delivery SMS',
  'Government official impersonation',
  'Bank phishing',
  'Job / task scam',
  'Investment / crypto scam',
  'Online shopping scam',
  'Fake friend call',
  'Love / romance scam',
  'Tech support scam',
  'Other'
];

KW.CHANNELS = ['SMS', 'WhatsApp / Telegram', 'Phone call', 'Email', 'Social media', 'Website / ad', 'In person', 'Not sure'];

KW.FLAIRS = [
  { id: 'ask', label: 'Is this a scam?' },
  { id: 'alert', label: 'Scam alert' },
  { id: 'tips', label: 'Tips & advice' },
  { id: 'debate', label: 'Debate' },
  { id: 'story', label: 'My story' }
];

KW.VOLUNTEERS = [
  { name: 'Aunty Mei Ling', role: 'Digital Ambassador', area: 'Tampines', langs: 'English, 华语' },
  { name: 'Mrs Kavitha', role: 'RC Volunteer', area: 'Tampines', langs: 'English, தமிழ்' },
  { name: 'Encik Hafiz', role: 'CC Scam-Buster', area: 'Tampines', langs: 'English, Melayu' },
  { name: 'Hafiz', role: 'RC Volunteer', area: 'Woodlands', langs: 'English, Melayu' },
  { name: 'Priya', role: 'Student Volunteer', area: 'Clementi', langs: 'English, தமிழ்' },
  { name: 'Uncle Tan', role: 'CC Scam-Buster', area: 'Ang Mo Kio', langs: 'English, 华语, Hokkien' },
  { name: 'Jia Hui', role: 'Digital Ambassador', area: 'Punggol', langs: 'English, 华语' },
  { name: 'Mr Rahman', role: 'RC Chairman', area: 'Bedok', langs: 'English, Melayu' }
];

KW.HELPLINES = [
  { label: 'ScamShield Helpline', number: '1799', note: '24/7 scam advice' },
  { label: 'Police (emergency)', number: '999', note: 'If you are in danger or money is being taken now' },
  { label: 'Police Hotline', number: '1800 255 0000', note: 'Share information on a scam' }
];

/* Pause: the warning signs a resident can tap while someone is pressuring them. */
KW.PAUSE_SIGNS = [
  { id: 'pay', label: 'They want me to pay or transfer money' },
  { id: 'secret', label: 'They told me not to tell anyone' },
  { id: 'otp', label: 'They asked for an OTP, password or Singpass' },
  { id: 'app', label: 'They want me to install an app or share my screen' },
  { id: 'rush', label: 'They are rushing or threatening me' }
];

KW.PAUSE_CALLERS = [
  'Police or a government officer',
  'My bank',
  'A family member or friend',
  'An online buyer or seller',
  'A company or courier',
  'Someone else'
];

KW.RELATIONS = ['Son', 'Daughter', 'Grandchild', 'Spouse', 'Brother or sister', 'Friend', 'Neighbour', 'Volunteer', 'Other'];

/* Scam Drills: safe practice scams, sent by family or by volunteers to a whole
   estate. Each one copies a real pattern, so pressing Pause becomes a habit.
   `types` links a drill to Scam Radar report types, so a newly verified scam
   wave can become this week's drill. Links are shown as text, never opened. */
KW.DRILLS = [
  {
    id: 'parcel-fee', name: 'Parcel fee SMS', types: ['Fake delivery SMS'], channel: 'SMS', from: 'SG-Parcel',
    text: 'Your parcel could not be delivered due to an incomplete address. Pay S$1.80 within 24 hours to reschedule delivery, or it will be returned.',
    link: 'sgparcel-redelivery.top',
    lesson: ['Couriers don’t collect small fees through SMS links.', 'The 24-hour deadline is there to rush you.', 'Check a delivery by typing the courier’s official website yourself.']
  },
  {
    id: 'police-call', name: 'Fake police officer', types: ['Government official impersonation'], channel: 'WhatsApp', from: '+65 8xxx 4417 · “Inspector Lim, SPF”',
    text: 'This is Inspector Lim from the Singapore Police Force. Your bank account is linked to a money laundering case. Do not tell anyone, as this is confidential. Reply now to arrange a video call.',
    link: null,
    lesson: ['Real police officers never ask you to keep a case secret from family.', 'They will never ask you to transfer money to “help an investigation”.', 'Hang up, then call 1799 or your own contact at the police.']
  },
  {
    id: 'bank-otp', name: 'Bank payment alert', types: ['Bank phishing'], channel: 'SMS', from: 'SG-BankAlert',
    text: 'A payment of S$2,480.00 was made from your account. If this was not you, verify your identity immediately to stop the payment:',
    link: 'secure-sgbank-verify.click',
    lesson: ['Banks never send links that ask you to log in.', 'A big scary amount is meant to make you panic.', 'Call the number on the back of your card, not one in the message.']
  },
  {
    id: 'new-number', name: '“New number” from family', types: ['Fake friend call', 'Love / romance scam'], channel: 'WhatsApp', from: '+65 9xxx 2093',
    text: 'Hi Ma, this is my new number, my phone spoiled. Can help me pay a bill first? Need to settle today, I return you tonight. Don’t call the old number ok.',
    link: null,
    lesson: ['Call the person on their old number to check it’s really them.', '“Don’t call the old number” is a classic trick.', 'Agree on a family code word for any money request.']
  },
  {
    id: 'easy-job', name: 'Easy part-time job', types: ['Job / task scam', 'Investment / crypto scam'], channel: 'Telegram', from: 'HR Recruiter Amanda',
    text: 'Hi! We are hiring part-time. Earn $200 to $500 a day just by liking videos from home. No experience needed. Click to start your first task:',
    link: 'easytask-sg.vip',
    lesson: ['Real jobs don’t pay you to like videos.', 'Next they ask you to “top up” to unlock bigger tasks.', 'Unsolicited job offers on Telegram or WhatsApp are almost always scams.']
  },
  {
    id: 'buyer-claim', name: 'Buyer asks for card details', types: ['Online shopping scam', 'Tech support scam', 'Other'], channel: 'SMS', from: 'Buyer on marketplace',
    text: 'Hi, I have paid for your item already. Please claim your money through the secure payment page below, you need to key in your card details to receive.',
    link: 'marketplace-safepay.online',
    lesson: ['You never need card details to RECEIVE money.', 'Keep all chats and payments inside the marketplace app.', 'Fake “secure payment” pages steal your card details.']
  }
];

/* Red-flag rules for the instant checker. Deliberately simple keyword
   heuristics — the point is to prompt a pause, not to give a verdict. */
KW.FLAG_RULES = [
  { id: 'urgency', label: 'Rushes you or uses threats',
    tip: 'Scammers create panic so you act before thinking.',
    re: /\b(urgent(ly)?|immediately|within \d+ ?(hours?|hrs?|mins?|minutes|days?)|suspend(ed)?|frozen|final (notice|reminder|warning)|act now|expir(e|es|ed|ing)|blocked|arrest(ed)?|warrant|legal action|last chance)\b/i },
  { id: 'link', label: 'Contains a link',
    tip: 'Don’t tap it. Type the official website yourself.',
    re: /(https?:\/\/|www\.|bit\.ly|tinyurl|\b[a-z0-9-]+\.(xyz|top|click|info|cc|link|site|online|vip)\b)/i },
  { id: 'credentials', label: 'Asks for OTP, password or Singpass',
    tip: 'Banks and agencies never ask for these.',
    re: /\b(otp|one[- ]time password|pin|password|singpass|log ?in|verify your (account|identity|details)|card (number|details)|cvv|security code)\b/i },
  { id: 'payment', label: 'Asks you to pay or transfer money',
    tip: 'Be very careful with any request to send money or buy gift cards.',
    re: /\b(transfer|pay(ment)?|fee|deposit|gift ?cards?|top[- ]?up|bitcoin|crypto|usdt|paynow|bank account|safe account|lend|borrow)\b/i },
  { id: 'authority', label: 'Claims to be an authority or big company',
    tip: 'Hang up and call the official number yourself.',
    re: /\b(police|spf|mom|moh|ica|iras|cpf|court|customs|singpost|courier|dhl|bank|government|ministry|officer|interpol)\b/i },
  { id: 'toogood', label: 'Sounds too good to be true',
    tip: 'Prizes you never entered are classic bait.',
    re: /\b(won|winner|prize|lucky draw|free gift|earn \$?\d+|guaranteed|high returns?|commission|cashback|\d+ ?% (returns?|profit))\b/i },
  { id: 'job', label: 'Easy job or task offer',
    tip: 'Real jobs don’t pay you to like videos.',
    re: /\b(part[- ]time|work from home|like (videos|posts)|simple tasks?|daily pay|no experience|recruit(er|ment)?)\b/i },
  { id: 'secrecy', label: 'Asks you to keep it secret',
    tip: 'Being told not to tell family is a big warning sign.',
    re: /\b(don'?t tell|do not tell|keep (this|it) (secret|confidential|private)|do not inform|confidential)\b/i },
  { id: 'newcontact', label: 'Unknown contact claiming to know you',
    tip: 'Call them on their old number to check.',
    re: /\b(guess who|new number|changed my (number|phone)|this is my new|remember me|hi mum|hi dad)\b/i }
];

/* Learning courses. Lesson bodies are trusted HTML authored here. */
KW.COURSES = [
  {
    id: 'sms', title: 'Spotting phishing SMS & links', level: 'Beginner', minutes: 10,
    blurb: 'Recognise fake delivery, bank and prize messages before you tap.',
    lessons: [
      { title: 'What phishing looks like', body: `
        <p>Phishing messages pretend to come from someone you trust — a courier, your bank, a government agency — to get you to tap a link or share details.</p>
        <h4>Common signs</h4>
        <ul>
          <li>A small “fee” to redeliver a parcel or unlock an account</li>
          <li>A deadline: “within 24 hours” or “your account will be suspended”</li>
          <li>A link that looks <em>almost</em> right, like <code>singpost-redelivery.top</code></li>
          <li>Greetings like “Dear customer” instead of your name</li>
        </ul>
        <p class="callout">In Singapore, many organisations now send SMS from registered sender IDs. A message under <strong>“Likely-SCAM”</strong> means the sender is not registered — treat it as a scam.</p>` },
      { title: 'Checking a link safely', body: `
        <p>The safest rule is simple: <strong>don’t tap links in messages you weren’t expecting.</strong></p>
        <ol>
          <li>Open the official app or type the website address yourself.</li>
          <li>Log in there and check if there really is a problem.</li>
          <li>If unsure, paste the message into the <a href="#/ask">Ask a Neighbour</a> tool or the ScamShield app.</li>
        </ol>
        <p>Look closely at the domain — the part just before the first single “/”. <code>www.singpost.com.example.top</code> is <em>not</em> SingPost: it belongs to <code>example.top</code>.</p>` },
      { title: 'If you already clicked', body: `
        <p>It happens to careful people too. Act fast:</p>
        <ol>
          <li><strong>Call your bank’s 24-hour hotline</strong> (the number on the back of your card) and ask them to block your cards and accounts.</li>
          <li>Change passwords for any account you entered, starting with email and banking.</li>
          <li>Call the <strong>ScamShield Helpline 1799</strong> for advice, and make a police report.</li>
          <li>Tell family and post an alert on <a href="#/radar">Scam Radar</a> so neighbours are warned.</li>
        </ol>` }
    ],
    quiz: [
      { q: 'An SMS from “SingPost” asks you to pay $1.99 through a link to redeliver a parcel. What should you do?',
        options: ['Pay — it’s only $1.99', 'Tap the link just to check', 'Ignore the link and check tracking in the official app or website', 'Reply and ask for more details'],
        answer: 2, explain: 'Small fees are bait to collect your card details. Always check through the official channel.' },
      { q: 'Which of these is a red flag?',
        options: ['The message comes from a contact you saved long ago', 'A link like singpost-redelivery.xyz', 'The message has no link at all', 'It was sent during office hours'],
        answer: 1, explain: 'Look-alike domains with unusual endings (.xyz, .top) are a common phishing trick.' },
      { q: 'You entered your card details on a suspicious site. What is the first thing to do?',
        options: ['Wait and see if money goes missing', 'Call your bank’s 24-hour hotline to block the card', 'Delete the SMS', 'Post about it on Facebook'],
        answer: 1, explain: 'Blocking your card quickly is the best way to stop losses.' }
    ]
  },
  {
    id: 'gov', title: 'Fake officials & “police” calls', level: 'Intermediate', minutes: 12,
    blurb: 'How government-official impersonation scams work and how to hang up safely.',
    lessons: [
      { title: 'How the scam unfolds', body: `
        <p>It usually starts with a call from a “bank”, “courier” or “MOH officer” saying something is wrong — a parcel with illegal items, a medical record issue, or your account linked to a crime.</p>
        <p>You are then transferred to a “police officer” who may video-call you in uniform, show a fake warrant, and tell you to move money to a <strong>“safe account”</strong> for investigation.</p>
        <p class="callout">Government officials will <strong>never</strong> ask you to transfer money, hand over bank log-ins, install apps from unofficial sources, or transfer your call to the police.</p>` },
      { title: 'Spotting a spoofed call', body: `
        <ul>
          <li>Calls from overseas show a <strong>“+”</strong> in front of the number. A “+65” call claiming to be a local agency is suspicious.</li>
          <li>Real officers don’t conduct investigations over WhatsApp or video calls.</li>
          <li>Being told to keep it secret — even from family — is a huge red flag.</li>
        </ul>` },
      { title: 'What to say and do', body: `
        <ol>
          <li>Say “I’ll call you back” and <strong>hang up</strong>. You’re not being rude.</li>
          <li>Look up the agency’s official number yourself and call it.</li>
          <li>Talk to a family member or <a href="#/ask">ask a neighbour</a> before doing anything.</li>
          <li>Call <strong>1799</strong> if you’re unsure, or <strong>999</strong> if money is being taken right now.</li>
        </ol>` }
    ],
    quiz: [
      { q: 'A “police officer” says you must transfer your savings to a safe account during an investigation. Is this real?',
        options: ['Yes, if they show a warrant', 'Yes, if they’re in uniform on video', 'No — officials never ask you to transfer money', 'Only if the amount is small'],
        answer: 2, explain: 'No genuine government officer will ever ask you to transfer money.' },
      { q: 'A call shows “+65 6123 4567” and claims to be a local agency. What does the “+” suggest?',
        options: ['It’s a priority call', 'The call is coming from overseas', 'It’s a verified government line', 'Nothing'],
        answer: 1, explain: 'In Singapore, calls from overseas carry a “+” prefix — a spoofed local number is a warning sign.' },
      { q: 'What is the safest way to check if the caller is genuine?',
        options: ['Ask for their staff number', 'Call back the number they give you', 'Hang up and call the official number from the agency’s website', 'Ask them to send an email'],
        answer: 2, explain: 'Only trust contact details you found yourself.' }
    ]
  },
  {
    id: 'job', title: 'Job & task scams', level: 'Beginner', minutes: 8,
    blurb: 'Why “earn $300/day liking videos” always ends with you paying.',
    lessons: [
      { title: 'The hook', body: `
        <p>A friendly “recruiter” messages you on WhatsApp or Telegram offering easy part-time work: liking videos, rating hotels or “boosting” products.</p>
        <p>The first few tasks really do pay a small amount — this builds trust.</p>` },
      { title: 'The trap', body: `
        <p>Soon you’re told to unlock “premium tasks” or “merchant orders” by depositing money first. Your “earnings” grow on a website, but you can’t withdraw without paying yet another “fee” or “tax”.</p>
        <p class="callout">If a job asks you to pay before you earn, it is a scam.</p>` },
      { title: 'Protect yourself', body: `
        <ul>
          <li>Real employers don’t recruit through unsolicited WhatsApp messages.</li>
          <li>Never pay to get a job or to withdraw earnings.</li>
          <li>Don’t let anyone use your bank account to “receive payments” — you could become a money mule and face prosecution.</li>
        </ul>` }
    ],
    quiz: [
      { q: 'A job pays you $5 for liking 3 videos, then asks you to deposit $200 for higher-paying tasks. What is this?',
        options: ['A normal side hustle', 'A job scam', 'A loyalty programme', 'A government scheme'],
        answer: 1, explain: 'Small early payouts build trust before asking for bigger deposits.' },
      { q: 'Someone offers to pay you for letting them use your bank account. What’s the risk?',
        options: ['None, it’s easy money', 'You could become a money mule and be prosecuted', 'Slightly higher bank fees', 'Your interest rate changes'],
        answer: 1, explain: 'Letting others use your account to move money is a criminal offence.' },
      { q: 'Which is the clearest sign of a job scam?',
        options: ['The job is remote', 'You must pay before you can earn or withdraw', 'The salary is listed', 'There is an interview'],
        answer: 1, explain: 'Legitimate jobs never require you to pay to earn.' }
    ]
  },
  {
    id: 'invest', title: 'Investment & crypto scams', level: 'Intermediate', minutes: 12,
    blurb: 'Deepfake celebrity ads, “stock tip” groups and fake trading apps.',
    lessons: [
      { title: 'Where they find you', body: `
        <ul>
          <li>Social media ads featuring celebrities or politicians — often deepfaked videos</li>
          <li>“Stock tips” WhatsApp or Telegram groups full of members posting profits</li>
          <li>New online friends who casually mention their crypto gains</li>
        </ul>` },
      { title: 'How the money disappears', body: `
        <p>You’re guided to a slick trading website or app. Your balance seems to grow fast, so you invest more. When you try to withdraw, there are “taxes”, “verification fees” — and eventually the site disappears.</p>
        <p class="callout">Check that any investment firm is licensed using the <strong>MAS Financial Institutions Directory</strong> and isn’t on the MAS Investor Alert List.</p>` },
      { title: 'Rules of thumb', body: `
        <ul>
          <li>High returns with “no risk” don’t exist.</li>
          <li>Never install trading apps from links — only from official app stores, and only for licensed firms.</li>
          <li>Talk it over with someone you trust before investing.</li>
        </ul>` }
    ],
    quiz: [
      { q: 'A video shows a famous person promising 30% monthly returns on a crypto platform. What should you assume?',
        options: ['It’s a good opportunity', 'It may be a deepfake scam ad', 'It’s approved by the government', 'Returns are guaranteed'],
        answer: 1, explain: 'Scammers use deepfake videos of well-known people to look credible.' },
      { q: 'Your trading balance shows big profits, but withdrawing needs a “tax” payment first. This is…',
        options: ['Normal procedure', 'A sign of a scam', 'A bank requirement', 'A GST charge'],
        answer: 1, explain: 'Asking for fees to release your own money is a hallmark of investment scams.' },
      { q: 'Where can you check if a firm is licensed in Singapore?',
        options: ['Their own website', 'The MAS Financial Institutions Directory', 'A WhatsApp group', 'Online reviews'],
        answer: 1, explain: 'MAS keeps the official list of regulated financial institutions.' }
    ]
  },
  {
    id: 'shop', title: 'Safe online shopping', level: 'Beginner', minutes: 8,
    blurb: 'Buying and selling on marketplaces without getting burned.',
    lessons: [
      { title: 'Buying safely', body: `
        <ul>
          <li>Prices far below market — especially concert tickets, electronics and pets — are bait.</li>
          <li>Prefer meet-ups or the platform’s built-in payment protection.</li>
          <li>Be wary of sellers who rush you or move the chat off the platform.</li>
        </ul>` },
      { title: 'Selling safely', body: `
        <p>A common trick targets <em>sellers</em>: the “buyer” sends a link to “receive payment” or “verify your account”. It leads to a fake page that steals your bank log-in or card details.</p>
        <p class="callout">You never need to enter your bank log-in or OTP to <strong>receive</strong> money.</p>` },
      { title: 'If something goes wrong', body: `
        <ol>
          <li>Report the account to the platform.</li>
          <li>Contact your bank immediately if you shared details.</li>
          <li>Make a police report and warn others on <a href="#/radar">Scam Radar</a>.</li>
        </ol>` }
    ],
    quiz: [
      { q: 'A buyer sends you a link to “receive payment” that asks for your bank log-in. What do you do?',
        options: ['Log in to get paid', 'Stop — you never need to log in to receive money', 'Send your OTP instead', 'Ask them to resend the link'],
        answer: 1, explain: 'Receiving money never needs your log-in or OTP.' },
      { q: 'Concert tickets are selling at half price, but only via bank transfer before meeting. This is…',
        options: ['A lucky find', 'A likely scam', 'Normal for tickets', 'Safe if the seller has a profile photo'],
        answer: 1, explain: 'Cheap, in-demand items with upfront payment are classic shopping scams.' },
      { q: 'What’s the safer way to pay on a marketplace?',
        options: ['Gift cards', 'Crypto', 'The platform’s protected payment or cash on meet-up', 'Transfer to a friend of the seller'],
        answer: 2, explain: 'Protected payments and meet-ups let you check the item first.' }
    ]
  },
  {
    id: 'protect', title: 'Protecting our seniors', level: 'For everyone', minutes: 10,
    blurb: 'How to help parents and neighbours stay safe — without lecturing.',
    lessons: [
      { title: 'Remember: Add, Check, Tell', body: `
        <ul>
          <li><strong>Add</strong> — install the ScamShield app and turn on security features like banking transaction alerts and limits.</li>
          <li><strong>Check</strong> — look for scam signs and verify with official sources before acting.</li>
          <li><strong>Tell</strong> — tell family, friends and the authorities about scams you encounter.</li>
        </ul>` },
      { title: 'Setting up a safer phone', body: `
        <ol>
          <li>Install the ScamShield app to filter scam calls and SMS.</li>
          <li>In WhatsApp, open Settings, then Privacy, then Calls, and turn on <em>Silence unknown callers</em>.</li>
          <li>In the banking app: lower the daily transfer limit and switch on alerts for every transaction.</li>
          <li>Save family numbers with clear names, so “new number” tricks stand out.</li>
        </ol>` },
      { title: 'Talking about it kindly', body: `
        <p>Shame keeps victims silent. Share your own near-misses, praise them for checking, and agree on a family “check with me first” rule for any money request.</p>
        <p class="callout">Seniors who prefer talking can use the <strong>call-back option</strong> on <a href="#/ask">Ask a Neighbour</a> to speak to a volunteer in their language.</p>` }
    ],
    quiz: [
      { q: 'What does “Add, Check, Tell” stand for?',
        options: ['Add friends, Check social media, Tell stories', 'Add security features, Check for scam signs, Tell others', 'Add money, Check balance, Tell bank', 'None of these'],
        answer: 1, explain: 'Add security features, Check for scam signs, and Tell family and authorities.' },
      { q: 'Your mum gets a WhatsApp from “you” on a new number asking for money. What family rule helps most?',
        options: ['Always pay quickly', 'Call the person on their old number first', 'Reply asking for a photo', 'Ignore all messages'],
        answer: 1, explain: 'Verifying on a known number defeats “new number” impersonation.' },
      { q: 'Which approach helps seniors report scams?',
        options: ['Scolding them for falling for it', 'Sharing your own near-misses and praising them for checking', 'Taking away their phone', 'Telling them scams are rare'],
        answer: 1, explain: 'Removing shame makes people more likely to ask for help early.' }
    ]
  }
];

/* "Spot the scam" quick game. */
KW.SPOT_GAME = [
  { from: 'SMS · SingPost?', msg: 'SingPost: Your parcel could not be delivered due to an incomplete address. Update within 12 hrs: sgpost-track.top/r8x', isScam: true,
    explain: 'Unofficial domain, deadline pressure and an unexpected parcel. Check tracking in the official app instead.' },
  { from: 'SMS · Your bank', msg: 'A PayNow transfer of $50.00 to J TAN was made on 05 Oct. If unauthorised, call the number on the back of your card.', isScam: false,
    explain: 'No link, no request for details, and it tells you to use a number you already have. This is how genuine alerts look.' },
  { from: 'WhatsApp · +44 7700 900123', msg: 'Hi Mum, I dropped my phone in the toilet this is my new number. Can you help me pay a bill urgently? Will pay you back tomorrow', isScam: true,
    explain: '“New number” plus an urgent money request. Call your child on their old number first.' },
  { from: 'WhatsApp · Jess (Recruiter)', msg: 'Hi! I’m Jess from TalentHub. Earn $80–$500 daily just liking YouTube videos. No experience needed! Reply YES to start', isScam: true,
    explain: 'Unsolicited, too good to be true, and you’ll soon be asked to “top up” to continue.' },
  { from: 'SMS · just after you logged in', msg: 'Your OTP for login is 482910. Do not share this OTP with anyone, including bank staff.', isScam: false,
    explain: 'You triggered this OTP yourself and it warns you not to share it. If you didn’t request an OTP, someone may have your password — call your bank.' },
  { from: 'WhatsApp · Tampines West RC group', msg: 'Reminder: Line dance class this Saturday 9am at the RC centre. Bring water! See you there', isScam: false,
    explain: 'A known group, no links, no requests for money or details.' },
  { from: 'Phone call · +65 6123 4567', msg: '(Recorded voice) “This is the Ministry of Health. There is an issue with your medical records. Press 1 to speak to an officer.”', isScam: true,
    explain: 'The “+” shows it’s from overseas. Agencies don’t make robocalls asking you to press 1.' },
  { from: 'SMS · Lucky Draw', msg: 'Congratulations! You have won $5,000 in our anniversary lucky draw. Pay $25 processing fee to claim: bit.ly/claim-5k', isScam: true,
    explain: 'You can’t win a draw you never entered — and real prizes don’t charge a fee.' }
];

/* Fresh demo content, with dates relative to "now". */
KW.seed = function seed() {
  const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
  const handle = 'Resident-' + Math.floor(1000 + Math.random() * 9000);

  const reports = [
    { town: 'Tampines', type: 'Fake delivery SMS', channel: 'SMS', count: 47, status: 'verified', h: 5,
      title: 'Fake SingPost “redelivery fee” SMS spreading',
      desc: 'SMS claims your parcel is held due to an incomplete address and asks you to pay $1.99 via a link. The site steals card details.' },
    { town: 'Bedok', type: 'Government official impersonation', channel: 'Phone call', count: 18, status: 'verified', h: 20,
      title: 'Callers posing as MOH, then “police” on video call',
      desc: 'Caller says your medical records are linked to a crime, transfers you to a uniformed “officer” on WhatsApp video who asks you to move savings to a “safe account”.' },
    { town: 'Jurong West', type: 'Job / task scam', channel: 'WhatsApp / Telegram', count: 32, status: 'verified', h: 30,
      title: '“$300 a day liking videos” WhatsApp offers',
      desc: 'Strangers offer part-time work liking YouTube videos. After small payouts, victims are told to top up for “premium tasks”.' },
    { town: 'Woodlands', type: 'Bank phishing', channel: 'SMS', count: 25, status: 'verified', h: 9,
      title: 'SMS: “Your bank account has been suspended”',
      desc: 'Messages spoofing a local bank ask you to “verify” at a link. Banks will not send clickable links by SMS.' },
    { town: 'Punggol', type: 'Online shopping scam', channel: 'Social media', count: 6, status: 'pending', h: 3,
      title: 'Concert tickets sold below price, seller vanishes',
      desc: 'Marketplace seller asks for PayNow transfer before meet-up, then blocks buyers.' },
    { town: 'Ang Mo Kio', type: 'Fake friend call', channel: 'Phone call', count: 14, status: 'verified', h: 44,
      title: '“Hi, guess who?” calls targeting seniors',
      desc: 'Caller pretends to be a relative or old friend with a new number, then asks to borrow money urgently.' },
    { town: 'Sengkang', type: 'Investment / crypto scam', channel: 'Website / ad', count: 4, status: 'pending', h: 12,
      title: 'Deepfake celebrity crypto ad on Facebook',
      desc: 'Video of a well-known personality “endorsing” a crypto platform promising 30% monthly returns.' },
    { town: 'Yishun', type: 'Love / romance scam', channel: 'Social media', count: 3, status: 'verified', h: 70,
      title: 'Online “partner” asks for money for customs fee',
      desc: 'Overseas online partner claims a gift parcel is stuck at customs and needs a fee to release it.' },
    { town: 'Toa Payoh', type: 'Tech support scam', channel: 'Website / ad', count: 2, status: 'pending', h: 6,
      title: 'Pop-up says computer is infected, call “Microsoft”',
      desc: 'Browser pop-up with alarm sound asks you to call a number. “Technician” requests remote access.' },
    { town: 'Hougang', type: 'Fake delivery SMS', channel: 'SMS', count: 21, status: 'verified', h: 16,
      title: 'Same parcel redelivery SMS reaching Hougang',
      desc: 'Identical wording to the Tampines wave, different link. Do not tap.' },
    { town: 'Clementi', type: 'Government official impersonation', channel: 'Phone call', count: 1, status: 'rumour', h: 50,
      title: 'Claim that ICA is fining everyone for late passport renewal',
      desc: 'Checked by Clementi CC: the call was a genuine renewal reminder with no payment request. No scam wave found.' },
    { town: 'Bukit Batok', type: 'Job / task scam', channel: 'WhatsApp / Telegram', count: 5, status: 'pending', h: 8,
      title: 'Telegram “hotel rating” job group',
      desc: 'Members are added to a group that pays for rating hotels, then asked to deposit to unlock higher commissions.' },
    { town: 'Pasir Ris', type: 'Bank phishing', channel: 'Email', count: 9, status: 'verified', h: 60,
      title: 'Email: “Unusual sign-in, confirm your card”',
      desc: 'Email with bank logo links to a fake log-in page. Report it and delete.' },
    { town: 'Bishan', type: 'Fake delivery SMS', channel: 'SMS', count: 3, status: 'pending', h: 2,
      title: 'Customs “duty unpaid” SMS',
      desc: 'Says a parcel is held by customs and asks for duty payment via link.' },
    { town: 'Choa Chu Kang', type: 'Online shopping scam', channel: 'Social media', count: 11, status: 'verified', h: 90,
      title: 'Fake pet sellers asking for “delivery deposit”',
      desc: 'Puppy listings with stolen photos; seller asks for deposit and transport fees, then disappears.' },
    { town: 'Queenstown', type: 'Investment / crypto scam', channel: 'WhatsApp / Telegram', count: 8, status: 'verified', h: 120,
      title: '“Stock tips” WhatsApp group with fake trading app',
      desc: 'Group of “members” post profits. New joiners are told to install an app from a link. Withdrawals are blocked.' }
  ].map((r, i) => ({
    id: 'r' + (i + 1), town: r.town, type: r.type, channel: r.channel, title: r.title, desc: r.desc,
    count: r.count, status: r.status, created: ago(r.h), image: null,
    verifiedBy: r.status === 'pending' ? null : r.town + ' CC'
  }));

  const posts = [
    {
      id: 'p1', flair: 'ask', author: 'AuntieRose_AMK', created: ago(3), votes: 42, image: null,
      title: 'Got an SMS saying my CPF will be frozen in 24 hours — real?',
      body: 'It says “CPF Board: Your account will be frozen within 24 hours due to incomplete verification. Log in with Singpass here” and then a link. I never had problems with CPF before. Should I click?',
      poll: { options: [{ label: 'Scam', votes: 31 }, { label: 'Looks legit', votes: 1 }, { label: 'Not sure', votes: 3 }] },
      verdict: { result: 'scam', by: 'Uncle Tan · CC Scam-Buster' },
      comments: [
        { id: 'c1', author: 'Uncle Tan', role: 'Volunteer', created: ago(2.5), votes: 28,
          body: 'Don’t click, Auntie! CPF Board will not threaten to freeze your account by SMS or ask you to log in through a link. If you want to check, open the official CPF website or app yourself. You can report the SMS in the ScamShield app.',
          replies: [
            { id: 'c2', author: 'AuntieRose_AMK', created: ago(2), votes: 6, body: 'Thank you! I deleted it and told my sister too.', replies: [] }
          ] },
        { id: 'c3', author: 'Resident-4471', created: ago(2.2), votes: 9, body: 'Same message came to my dad in Bishan this morning. Classic urgency + Singpass link combo.', replies: [] }
      ]
    },
    {
      id: 'p2', flair: 'alert', author: 'BedokNorthRC', created: ago(10), votes: 88, image: null,
      title: 'PSA: “Hi Mum, new number” WhatsApp messages going around Bedok',
      body: 'Several residents have received WhatsApp messages from unknown numbers pretending to be their children. They ask for urgent help paying a bill. Please call your children on their usual number before sending anything. Share with your parents!',
      comments: [
        { id: 'c4', author: 'Resident-2210', created: ago(8), votes: 14, body: 'My mother got one yesterday. She replied “What’s your NRIC?” and they blocked her', replies: [] }
      ]
    },
    {
      id: 'p3', flair: 'tips', author: 'Priya (Student Volunteer)', created: ago(30), votes: 120, image: null,
      title: 'How I set up my grandparents’ phones to block scam calls (step by step)',
      body: '1. Install the ScamShield app and enable call & SMS filtering.\n2. WhatsApp: open Settings, then Privacy, then Calls, and turn on Silence unknown callers.\n3. In the banking app, lower the daily PayNow limit and turn on alerts for every transaction.\n4. Save family numbers with clear names like “Son – Daniel”.\n5. Put a sticker on the phone: “Money request? Call family first!”\nTook about 20 minutes per phone. Happy to help at Clementi CC on Saturdays!',
      comments: [
        { id: 'c5', author: 'Resident-8812', created: ago(20), votes: 11, body: 'The sticker idea is genius. Doing this for my parents this weekend.', replies: [] },
        { id: 'c6', author: 'Hafiz', role: 'Volunteer', created: ago(18), votes: 7, body: 'Great list. Woodlands RC also runs these setup sessions — first Sunday of the month.', replies: [] }
      ]
    },
    {
      id: 'p4', flair: 'debate', author: 'Resident-3390', created: ago(26), votes: 35, image: null,
      title: 'Should banks fully refund scam victims?',
      body: 'Some say banks should bear the losses because their systems should catch suspicious transfers. Others say it would encourage carelessness. Where do you stand?',
      poll: { options: [{ label: 'Banks should refund fully', votes: 41 }, { label: 'Share the loss', votes: 57 }, { label: 'Victims are responsible', votes: 12 }] },
      comments: [
        { id: 'c7', author: 'Resident-1702', created: ago(22), votes: 19, body: 'Shared responsibility makes sense. Banks should slow down large first-time transfers though.', replies: [
          { id: 'c8', author: 'Resident-6630', created: ago(21), votes: 5, body: 'Agree — a cooling-off period for big transfers to new payees would save many people.', replies: [] }
        ] }
      ]
    },
    {
      id: 'p5', flair: 'story', author: 'Daniel_TPY', created: ago(52), votes: 210, image: null,
      title: 'My dad almost lost $20k to a fake “police officer” — what saved him',
      body: 'He was on a video call for 2 hours with someone in uniform who said his account was used for money laundering. They told him not to tell anyone. What saved him: he had a family rule to call me before any big transfer. When he called, I asked him to hang up and we called 1799 together. Please set up a rule like this with your parents.',
      comments: [
        { id: 'c9', author: 'Aunty Mei Ling', role: 'Volunteer', created: ago(50), votes: 44, body: 'Thank you for sharing this, Daniel. The “don’t tell anyone” part is the biggest red flag. So glad your dad is safe.', replies: [] }
      ]
    },
    {
      id: 'p6', flair: 'ask', author: 'Resident-5521', created: ago(1.5), votes: 7, image: null,
      title: 'Carousell buyer wants me to click a link to “receive payment”',
      body: 'Selling my old rice cooker. Buyer says they paid and I need to click a link and enter my bank details to receive the money. Something feels off?',
      poll: { options: [{ label: 'Scam', votes: 9 }, { label: 'Looks legit', votes: 0 }, { label: 'Not sure', votes: 1 }] },
      comments: []
    },
    {
      id: 'p7', flair: 'tips', author: 'TampinesCentralCC', created: ago(70), votes: 64, image: null,
      title: 'Free scam-awareness workshop at Tampines Hub this Saturday',
      body: 'Join our Digital Ambassadors for a hands-on session: spotting fake SMS, setting up ScamShield, and safe online shopping. Conducted in English and Mandarin. Walk-ins welcome, 10am–12pm.',
      comments: []
    }
  ];

  return {
    version: KW.VERSION,
    me: { handle },
    settings: { largeText: false, volunteer: false },
    subscription: { town: '', enabled: false },
    reports, posts,
    cases: [],
    progress: {},
    votes: {}, commentVotes: {}, pollVotes: {}, confirmed: {},
    gameBest: 0,
    draft: ''
  };
};
