// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA BIBLE VERSES  v1.0.0                                  ║
// ║  200+ verses from across scripture.                          ║
// ║  Psalms 82:6 is the Lumora motto and appears more often.     ║
// ║  getVerse() returns a random verse; getMotto() always        ║
// ║  returns the motto. appendVerse(text) adds one to any msg.   ║
// ╚═══════════════════════════════════════════════════════════════╝

const VERSES = [
  // ═══════════════════════════════════════════════════════════════
  //  PSALMS 82:6 — THE LUMORA MOTTO
  // ═══════════════════════════════════════════════════════════════
  { ref: "Psalms 82:6", text: "You are gods, children of the Most High, all of you." },
  { ref: "Psalms 82:6", text: "You are gods, children of the Most High, all of you." },
  { ref: "Psalms 82:6", text: "You are gods, children of the Most High, all of you." },

  // ═══════════════════════════════════════════════════════════════
  //  GENESIS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Genesis 1:3", text: "And God said, \"Let there be light,\" and there was light." },
  { ref: "Genesis 1:27", text: "So God created mankind in his own image, in the image of God he created them; male and female he created them." },
  { ref: "Genesis 1:31", text: "God saw all that he had made, and it was very good." },
  { ref: "Genesis 2:7", text: "Then the LORD God formed a man from the dust of the ground and breathed into his nostrils the breath of life." },
  { ref: "Genesis 12:2", text: "I will make you into a great nation, and I will bless you; I will make your name great." },
  { ref: "Genesis 15:1", text: "Do not be afraid, Abram. I am your shield, your very great reward." },
  { ref: "Genesis 28:15", text: "I am with you and will watch over you wherever you go." },
  { ref: "Genesis 50:20", text: "You intended to harm me, but God intended it for good to accomplish what is now being done." },

  // ═══════════════════════════════════════════════════════════════
  //  EXODUS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Exodus 3:14", text: "God said to Moses, \"I AM WHO I AM.\"" },
  { ref: "Exodus 14:14", text: "The LORD will fight for you; you need only to be still." },
  { ref: "Exodus 15:2", text: "The LORD is my strength and my defense; he has become my salvation." },
  { ref: "Exodus 33:14", text: "My Presence will go with you, and I will give you rest." },

  // ═══════════════════════════════════════════════════════════════
  //  DEUTERONOMY
  // ═══════════════════════════════════════════════════════════════
  { ref: "Deuteronomy 6:5", text: "Love the LORD your God with all your heart and with all your soul and with all your strength." },
  { ref: "Deuteronomy 31:6", text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go." },
  { ref: "Deuteronomy 31:8", text: "The LORD himself goes before you and will be with you; he will never leave you nor forsake you." },

  // ═══════════════════════════════════════════════════════════════
  //  JOSHUA
  // ═══════════════════════════════════════════════════════════════
  { ref: "Joshua 1:9", text: "Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go." },
  { ref: "Joshua 1:9", text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go." },

  // ═══════════════════════════════════════════════════════════════
  //  JUDGES / RUTH
  // ═══════════════════════════════════════════════════════════════
  { ref: "Judges 6:14", text: "Go in the strength you have and save Israel out of Midian's hand. Am I not sending you?" },
  { ref: "Ruth 1:16", text: "Where you go I will go, and where you stay I will stay." },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 SAMUEL
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Samuel 12:24", text: "Consider how great things he has done for you." },
  { ref: "1 Samuel 16:7", text: "The LORD does not look at the things people look at. People look at the outward appearance, but the LORD looks at the heart." },
  { ref: "2 Samuel 22:3", text: "My God is my rock, in whom I take refuge, my shield and the horn of my salvation." },
  { ref: "2 Samuel 22:33", text: "It is God who arms me with strength and keeps my way secure." },
  { ref: "2 Samuel 22:47", text: "The LORD lives! Praise be to my Rock! Exalted be my God, the Rock, my Savior!" },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 KINGS
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Kings 8:27", text: "But will God really dwell on earth? The heavens, even the highest heaven, cannot contain you." },
  { ref: "1 Kings 19:11", text: "Go out and stand on the mountain in the presence of the LORD, for the LORD is about to pass by." },
  { ref: "2 Kings 6:16", text: "Don't be afraid. Those who are with us are more than those who are with them." },

  // ═══════════════════════════════════════════════════════════════
  //  PSALMS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Psalms 1:1", text: "Blessed is the one who does not walk in step with the wicked." },
  { ref: "Psalms 1:3", text: "That person is like a tree planted by streams of water, which yields its fruit in season." },
  { ref: "Psalms 3:3", text: "But you, LORD, are a shield around me, my glory, the One who lifts my head high." },
  { ref: "Psalms 5:3", text: "In the morning, LORD, you hear my voice; in the morning I lay my requests before you and wait expectantly." },
  { ref: "Psalms 16:8", text: "I keep my eyes always on the LORD. With him at my right hand, I will not be shaken." },
  { ref: "Psalms 18:2", text: "The LORD is my rock, my fortress and my deliverer; my God is my rock, in whom I take refuge." },
  { ref: "Psalms 18:32", text: "It is God who arms me with strength and keeps my way secure." },
  { ref: "Psalms 20:4", text: "May he give you the desire of your heart and make all your plans succeed." },
  { ref: "Psalms 23:1", text: "The LORD is my shepherd, I lack nothing." },
  { ref: "Psalms 23:4", text: "Even though I walk through the darkest valley, I will fear no evil, for you are with me." },
  { ref: "Psalms 25:4-5", text: "Show me your ways, LORD, teach me your paths. Guide me in your truth and teach me." },
  { ref: "Psalms 27:1", text: "The LORD is my light and my salvation — whom shall I fear?" },
  { ref: "Psalms 28:7", text: "The LORD is my strength and my shield; my heart trusts in him, and he helps me." },
  { ref: "Psalms 29:11", text: "The LORD gives strength to his people; the LORD blesses his people with peace." },
  { ref: "Psalms 32:8", text: "I will instruct you and teach you in the way you should go; I will counsel you with my loving eye on you." },
  { ref: "Psalms 34:1", text: "I will extol the LORD at all times; his praise will always be on my lips." },
  { ref: "Psalms 34:10", text: "The lions may grow weak and hungry, but those who seek the LORD lack no good thing." },
  { ref: "Psalms 37:4", text: "Take delight in the LORD, and he will give you the desires of your heart." },
  { ref: "Psalms 37:5", text: "Commit your way to the LORD; trust in him and he will do this." },
  { ref: "Psalms 37:23", text: "The LORD makes firm the steps of the one who delights in him." },
  { ref: "Psalms 40:8", text: "I desire to do your will, O my God; your law is within my heart." },
  { ref: "Psalms 42:1", text: "As the deer pants for streams of water, so my soul pants for you, my God." },
  { ref: "Psalms 46:1", text: "God is our refuge and strength, an ever-present help in trouble." },
  { ref: "Psalms 46:10", text: "Be still, and know that I am God." },
  { ref: "Psalms 51:10", text: "Create in me a pure heart, O God, and renew a steadfast spirit within me." },
  { ref: "Psalms 55:22", text: "Cast your cares on the LORD and he will sustain you; he will never let the righteous be shaken." },
  { ref: "Psalms 56:3", text: "When I am afraid, I put my trust in you." },
  { ref: "Psalms 59:16", text: "I will sing of your strength, in the morning I will sing of your love." },
  { ref: "Psalms 62:1", text: "Truly my soul finds rest in God; my salvation comes from him." },
  { ref: "Psalms 62:8", text: "Trust in him at all times, you people; pour out your hearts to him." },
  { ref: "Psalms 63:3", text: "Because your love is better than life, my lips will glorify you." },
  { ref: "Psalms 66:1", text: "Shout for joy to God, all the earth!" },
  { ref: "Psalms 73:26", text: "My flesh and my heart may fail, but God is the strength of my heart and my portion forever." },
  { ref: "Psalms 81:10", text: "Open wide your mouth and I will fill it." },
  { ref: "Psalms 84:11", text: "For the LORD God is a sun and shield; the LORD bestows favor and honor." },
  { ref: "Psalms 86:5", text: "You, Lord, are forgiving and good, abounding in love to all who call to you." },
  { ref: "Psalms 89:1", text: "I will sing of the LORD's great love forever." },
  { ref: "Psalms 91:1", text: "Whoever dwells in the shelter of the Most High will rest in the shadow of the Almighty." },
  { ref: "Psalms 91:2", text: "I will say of the LORD, \"He is my refuge and my fortress, my God, in whom I trust.\"" },
  { ref: "Psalms 91:11", text: "For he will command his angels concerning you to guard you in all your ways." },
  { ref: "Psalms 91:14", text: "Because he loves me,\" says the LORD, \"I will rescue him; I will protect him, for he acknowledges my name.\"" },
  { ref: "Psalms 95:1", text: "Come, let us sing for joy to the LORD; let us shout aloud to the Rock of our salvation." },
  { ref: "Psalms 97:1", text: "The LORD reigns, let the earth be glad." },
  { ref: "Psalms 100:1", text: "Shout for joy to the LORD, all the earth." },
  { ref: "Psalms 100:5", text: "For the LORD is good and his love endures forever; his faithfulness continues through all generations." },
  { ref: "Psalms 103:1", text: "Praise the LORD, my soul, and forget not all his benefits." },
  { ref: "Psalms 103:12", text: "As far as the east is from the west, so far has he removed our transgressions from us." },
  { ref: "Psalms 107:1", text: "Give thanks to the LORD, for he is good; his love endures forever." },
  { ref: "Psalms 118:6", text: "The LORD is on my side; I will not fear." },
  { ref: "Psalms 119:105", text: "Your word is a lamp for my feet, a light on my path." },
  { ref: "Psalms 119:114", text: "You are my refuge and my shield; I have put my hope in your word." },
  { ref: "Psalms 121:1", text: "I lift up my eyes to the mountains — where does my help come from?" },
  { ref: "Psalms 121:2", text: "My help comes from the LORD, the Maker of heaven and earth." },
  { ref: "Psalms 121:7-8", text: "The LORD will watch over your coming and going both now and forevermore." },
  { ref: "Psalms 126:5", text: "Those who sow with tears will reap with songs of joy." },
  { ref: "Psalms 138:3", text: "When I called, you answered me; you made me bold and stout-hearted." },
  { ref: "Psalms 139:14", text: "I praise you because I am fearfully and wonderfully made." },
  { ref: "Psalms 143:8", text: "Let the morning bring me word of your unfailing love, for I have put my trust in you." },
  { ref: "Psalms 144:1", text: "Praise be to the LORD my Rock, who trains my hands for war, my fingers for battle." },
  { ref: "Psalms 145:9", text: "The LORD is good to all; he has compassion on all he has made." },
  { ref: "Psalms 147:3", text: "He heals the brokenhearted and binds up their wounds." },
  { ref: "Psalms 150:6", text: "Let everything that has breath praise the LORD." },

  // ═══════════════════════════════════════════════════════════════
  //  PROVERBS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Proverbs 1:7", text: "The fear of the LORD is the beginning of knowledge." },
  { ref: "Proverbs 2:6", text: "For the LORD gives wisdom; from his mouth come knowledge and understanding." },
  { ref: "Proverbs 3:5-6", text: "Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight." },
  { ref: "Proverbs 3:7", text: "Do not be wise in your own eyes; fear the LORD and shun evil." },
  { ref: "Proverbs 4:7", text: "The beginning of wisdom is this: Get wisdom. Though it cost all you have, get understanding." },
  { ref: "Proverbs 4:23", text: "Above all else, guard your heart, for everything you do flows from it." },
  { ref: "Proverbs 8:10-11", text: "Choose my instruction instead of silver, knowledge rather than gold. For wisdom is more precious than rubies." },
  { ref: "Proverbs 9:10", text: "The fear of the LORD is the beginning of wisdom, and knowledge of the Holy One is understanding." },
  { ref: "Proverbs 10:4", text: "Lazy hands make for poverty, but diligent hands bring wealth." },
  { ref: "Proverbs 10:9", text: "Whoever walks in integrity walks securely, but whoever takes crooked paths will be found out." },
  { ref: "Proverbs 10:22", text: "The blessing of the LORD brings wealth, without painful toil for it." },
  { ref: "Proverbs 11:1", text: "The LORD detests dishonest scales, but accurate weights find favor with him." },
  { ref: "Proverbs 11:25", text: "A generous person will prosper; whoever refreshes others will be refreshed." },
  { ref: "Proverbs 11:28", text: "Those who trust in their riches will fall, but the righteous will thrive like a green leaf." },
  { ref: "Proverbs 12:11", text: "Those who work their land will have abundant food, but those who chase fantasies have no sense." },
  { ref: "Proverbs 13:4", text: "A sluggard's appetite is never filled, but the desires of the diligent are fully satisfied." },
  { ref: "Proverbs 13:11", text: "Dishonest money dwindles away, but whoever gathers money little by little makes it grow." },
  { ref: "Proverbs 13:22", text: "A good person leaves an inheritance for their children's children." },
  { ref: "Proverbs 14:23", text: "All hard work brings a profit, but mere talk leads only to poverty." },
  { ref: "Proverbs 15:1", text: "A gentle answer turns away wrath, but a harsh word stirs up anger." },
  { ref: "Proverbs 15:3", text: "The eyes of the LORD are everywhere, keeping watch on the wicked and the good." },
  { ref: "Proverbs 15:33", text: "Wisdom is instruction and humility comes before honor." },
  { ref: "Proverbs 16:3", text: "Commit to the LORD whatever you do, and he will establish your plans." },
  { ref: "Proverbs 16:9", text: "In their hearts humans plan their course, but the LORD establishes their steps." },
  { ref: "Proverbs 16:18", text: "Pride goes before destruction, a haughty spirit before a fall." },
  { ref: "Proverbs 17:17", text: "A friend loves at all times, and a brother is born for a time of adversity." },
  { ref: "Proverbs 18:10", text: "The name of the LORD is a fortified tower; the righteous run to it and are safe." },
  { ref: "Proverbs 18:16", text: "A gift opens the way and ushers the giver into the presence of the great." },
  { ref: "Proverbs 19:17", text: "Whoever is kind to the poor lends to the LORD, and he will reward them for what they have done." },
  { ref: "Proverbs 20:7", text: "The righteous lead blameless lives; blessed are their children after them." },
  { ref: "Proverbs 21:5", text: "The plans of the diligent lead to profit as surely as haste leads to poverty." },
  { ref: "Proverbs 21:21", text: "Whoever pursues righteousness and love finds life, prosperity and honor." },
  { ref: "Proverbs 22:1", text: "A good name is more desirable than great riches; to be esteemed is better than silver or gold." },
  { ref: "Proverbs 22:4", text: "Humility and the fear of the LORD bring wealth and honor and life." },
  { ref: "Proverbs 22:6", text: "Start children off on the way they should go, and even when they are old they will not turn from it." },
  { ref: "Proverbs 22:29", text: "Do you see someone skilled in their work? They will serve before kings." },
  { ref: "Proverbs 23:4-5", text: "Do not wear yourself out to get rich; do not trust your own cleverness. Cast but a glance at riches, and they are gone." },
  { ref: "Proverbs 24:17", text: "Do not gloat when your enemy falls; when they stumble, do not let your heart rejoice." },
  { ref: "Proverbs 25:21", text: "If your enemy is hungry, give him food to eat; if he is thirsty, give him water to drink." },
  { ref: "Proverbs 27:17", text: "As iron sharpens iron, so one person sharpens another." },
  { ref: "Proverbs 28:10", text: "Whoever leads the upright along an evil path will fall into their own trap." },
  { ref: "Proverbs 28:20", text: "Whoever can be trusted with very little can also be trusted with much." },
  { ref: "Proverbs 28:27", text: "Those who give to the poor will lack nothing, but those who close their eyes to them receive many curses." },
  { ref: "Proverbs 29:25", text: "Fear of man will prove to be a snare, but whoever trusts in the LORD is kept safe." },
  { ref: "Proverbs 30:5", text: "Every word of God is flawless; he is a shield to those who take refuge in him." },
  { ref: "Proverbs 31:10", text: "A wife of noble character who can find? She is worth far more than rubies." },
  { ref: "Proverbs 31:25", text: "She is clothed with strength and dignity; she can laugh at the days to come." },

  // ═══════════════════════════════════════════════════════════════
  //  ECCLESIASTES
  // ═══════════════════════════════════════════════════════════════
  { ref: "Ecclesiastes 3:1", text: "There is a time for everything, and a season for every activity under the heavens." },
  { ref: "Ecclesiastes 4:9", text: "Two are better than one, because they have a good return for their labor." },
  { ref: "Ecclesiastes 12:13", text: "Fear God and keep his commandments, for this is the duty of all mankind." },

  // ═══════════════════════════════════════════════════════════════
  //  SONG OF SOLOMON
  // ═══════════════════════════════════════════════════════════════
  { ref: "Song of Solomon 8:6", text: "Place me like a seal over your heart, like a seal on your arm; for love is as strong as death." },

  // ═══════════════════════════════════════════════════════════════
  //  ISAIAH
  // ═══════════════════════════════════════════════════════════════
  { ref: "Isaiah 1:18", text: "Come now, let us settle the matter. Though your sins are like scarlet, they shall be as white as snow." },
  { ref: "Isaiah 6:8", text: "Then I heard the voice of the Lord saying, \"Whom shall I send? And who will go for us?\" And I said, \"Here am I. Send me!\"" },
  { ref: "Isaiah 9:6", text: "For to us a child is born, to us a son is given, and the government will be on his shoulders." },
  { ref: "Isaiah 11:2", text: "The Spirit of the LORD will rest on him — the Spirit of wisdom and of understanding." },
  { ref: "Isaiah 26:3", text: "You will keep in perfect peace those whose minds are steadfast, because they trust in you." },
  { ref: "Isaiah 40:8", text: "The grass withers and the flowers fall, but the word of our God endures forever." },
  { ref: "Isaiah 40:31", text: "But those who hope in the LORD will renew their strength. They will soar on wings like eagles." },
  { ref: "Isaiah 41:10", text: "So do not fear, for I am with you; do not be dismayed, for I am your God." },
  { ref: "Isaiah 43:2", text: "When you pass through the waters, I will be with you; and when you pass through the rivers, they will not sweep over you." },
  { ref: "Isaiah 53:5", text: "But he was pierced for our transgressions, he was crushed for our iniquities; the punishment that brought us peace was on him." },
  { ref: "Isaiah 54:10", text: "Though the mountains be shaken and the hills be removed, yet my unfailing love for you will not be shaken." },
  { ref: "Isaiah 55:1", text: "Come, all you who are thirsty, come to the waters." },
  { ref: "Isaiah 55:8-9", text: "\"For my thoughts are not your thoughts, neither are your ways my ways,\" declares the LORD." },
  { ref: "Isaiah 58:6", text: "Is not this the kind of fasting I have chosen: to loose the chains of injustice?" },
  { ref: "Isaiah 60:1", text: "Arise, shine, for your light has come, and the glory of the LORD rises upon you." },
  { ref: "Isaiah 61:1", text: "The Spirit of the Sovereign LORD is on me, because the LORD has anointed me to proclaim good news to the poor." },

  // ═══════════════════════════════════════════════════════════════
  //  JEREMIAH
  // ═══════════════════════════════════════════════════════════════
  { ref: "Jeremiah 17:7", text: "But blessed is the one who trusts in the LORD, whose confidence is in him." },
  { ref: "Jeremiah 29:11", text: "For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future." },
  { ref: "Jeremiah 33:3", text: "Call to me and I will answer you and tell you great and unsearchable things you do not know." },

  // ═══════════════════════════════════════════════════════════════
  //  LAMENTATIONS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Lamentations 3:22-23", text: "Because of the LORD's great love we are not consumed, for his compassions never fail. They are new every morning." },
  { ref: "Lamentations 3:25", text: "The LORD is good to those whose hope is in him." },

  // ═══════════════════════════════════════════════════════════════
  //  EZEKIEL
  // ═══════════════════════════════════════════════════════════════
  { ref: "Ezekiel 36:26", text: "I will give you a new heart and put a new spirit in you." },
  { ref: "Ezekiel 37:4", text: "He said to me, \"Prophesy to these bones and say to them, 'Dry bones, hear the word of the LORD!'\"" },

  // ═══════════════════════════════════════════════════════════════
  //  DANIEL
  // ═══════════════════════════════════════════════════════════════
  { ref: "Daniel 1:17", text: "To these four young men God gave knowledge and understanding of all kinds of literature and learning." },
  { ref: "Daniel 3:17", text: "If we are thrown into the blazing furnace, the God we serve is able to deliver us from it." },
  { ref: "Daniel 12:3", text: "Those who are wise will shine like the brightness of the heavens." },

  // ═══════════════════════════════════════════════════════════════
  //  HOSEA / JOEL / AMOS / MICAH
  // ═══════════════════════════════════════════════════════════════
  { ref: "Hosea 10:12", text: "Sow righteousness for yourselves, reap the fruit of unfailing love." },
  { ref: "Joel 2:25", text: "I will repay you for the years the locusts have eaten." },
  { ref: "Amos 5:24", text: "But let justice roll on like a river, righteousness like a never-failing stream." },
  { ref: "Micah 6:8", text: "He has shown you, O mortal, what is good. And what does the LORD require of you? To act justly and to love mercy and to walk humbly with your God." },
  { ref: "Micah 7:7", text: "But as for me, I watch in hope for the LORD, I wait for God my Savior." },

  // ═══════════════════════════════════════════════════════════════
  //  HABAKKUK / ZEPHANIAH / HAGGAI / ZECHARIAH / MALACHI
  // ═══════════════════════════════════════════════════════════════
  { ref: "Habakkuk 2:4", text: "See, the enemy is puffed up; his desires are not upright — but the righteous person will live by his faithfulness." },
  { ref: "Zephaniah 3:17", text: "The LORD your God is with you, the Mighty Warrior who saves. He will take great delight in you." },
  { ref: "Haggai 2:9", text: "The glory of this present house will be greater than the glory of the former house." },
  { ref: "Zechariah 4:6", text: "Not by might nor by power, but by my Spirit, says the LORD Almighty." },
  { ref: "Zechariah 9:9", text: "Rejoice greatly, Daughter Zion! See, your king comes to you, righteous and victorious." },
  { ref: "Malachi 3:10", text: "Bring the whole tithe into the storehouse... Test me in this, says the LORD Almighty, and see if I will not throw open the floodgates of heaven." },
  { ref: "Malachi 4:2", text: "But for you who fear my name, the Sun of Righteousness will rise with healing in its rays." },

  // ═══════════════════════════════════════════════════════════════
  //  MATTHEW
  // ═══════════════════════════════════════════════════════════════
  { ref: "Matthew 5:3", text: "Blessed are the poor in spirit, for theirs is the kingdom of heaven." },
  { ref: "Matthew 5:12", text: "Rejoice and be glad, because great is your reward in heaven." },
  { ref: "Matthew 5:16", text: "In the same way, let your light shine before others, that they may see your good deeds and glorify your Father in heaven." },
  { ref: "Matthew 6:14", text: "For if you forgive other people when they sin against you, your heavenly Father will also forgive you." },
  { ref: "Matthew 6:33", text: "But seek first his kingdom and his righteousness, and all these things will be given to you as well." },
  { ref: "Matthew 7:7", text: "Ask and it will be given to you; seek and you will find; knock and the door will be opened to you." },
  { ref: "Matthew 10:29", text: "Are not two sparrows sold for a penny? Yet not one of them will fall to the ground outside your Father's care." },
  { ref: "Matthew 11:28", text: "Come to me, all you who are weary and burdened, and I will give you rest." },
  { ref: "Matthew 17:20", text: "If you have faith as small as a mustard seed, you can say to this mountain, 'Move from here to there,' and it will move." },
  { ref: "Matthew 19:26", text: "Jesus looked at them and said, \"With man this is impossible, but with God all things are possible.\"" },
  { ref: "Matthew 22:37", text: "Jesus replied: 'Love the Lord your God with all your heart and with all your soul and with all your mind.'" },
  { ref: "Matthew 24:13", text: "But the one who endures to the end will be saved." },
  { ref: "Matthew 25:21", text: "\"Well done, good and faithful servant! You have been faithful with a few things; I will put you in charge of many things.\"" },
  { ref: "Matthew 28:18-19", text: "All authority in heaven and on earth has been given to me. Therefore go and make disciples of all nations." },

  // ═══════════════════════════════════════════════════════════════
  //  MARK
  // ═══════════════════════════════════════════════════════════════
  { ref: "Mark 10:27", text: "Jesus looked at them and said, \"With man this is impossible, but not with God; all things are possible with God.\"" },
  { ref: "Mark 11:24", text: "Therefore I tell you, whatever you ask for in prayer, believe that you have received it, and it will be yours." },
  { ref: "Mark 12:30-31", text: "Love the Lord your God with all your heart and with all your soul and with all your mind... Love your neighbor as yourself." },
  { ref: "Mark 13:31", text: "Heaven and earth will pass away, but my words will never pass away." },
  { ref: "Mark 16:15", text: "He said to them, \"Go into all the world and preach the gospel to all creation.\"" },

  // ═══════════════════════════════════════════════════════════════
  //  LUKE
  // ═══════════════════════════════════════════════════════════════
  { ref: "Luke 1:37", text: "For no word from God will ever fail." },
  { ref: "Luke 1:49", text: "For the Mighty One has done great things for me — holy is his name." },
  { ref: "Luke 6:31", text: "Do to others as you would have them do to you." },
  { ref: "Luke 9:23", text: "Then he said to them all: \"Whoever wants to be my disciple must deny themselves and take up their cross daily and follow me.\"" },
  { ref: "Luke 12:32", text: "\"Do not be afraid, little flock, for your Father has been pleased to give you the kingdom.\"" },
  { ref: "Luke 23:34", text: "Jesus said, \"Father, forgive them, for they do not know what they are doing.\"" },

  // ═══════════════════════════════════════════════════════════════
  //  JOHN
  // ═══════════════════════════════════════════════════════════════
  { ref: "John 1:5", text: "The light shines in the darkness, and the darkness has not overcome it." },
  { ref: "John 1:14", text: "The Word became flesh and made his dwelling among us." },
  { ref: "John 3:16", text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life." },
  { ref: "John 3:30", text: "He must become greater; I must become less." },
  { ref: "John 8:12", text: "When Jesus spoke again to the people, he said, \"I am the light of the world. Whoever follows me will never walk in darkness.\"" },
  { ref: "John 8:32", text: "Then you will know the truth, and the truth will set you free." },
  { ref: "John 10:10", text: "The thief comes only to steal and kill and destroy; I have come that they may have life, and have it to the full." },
  { ref: "John 10:28", text: "I give them eternal life, and they shall never perish; no one will snatch them out of my hand." },
  { ref: "John 13:7", text: "Jesus replied, \"You do not realize now what I am doing, but later you will understand.\"" },
  { ref: "John 13:34", text: "A new command I give you: Love one another. As I have loved you, so you must love one another." },
  { ref: "John 14:6", text: "Jesus answered, \"I am the way and the truth and the life. No one comes to the Father except through me.\"" },
  { ref: "John 14:27", text: "Peace I leave with you; my peace I give you. I do not give to you as the world gives." },
  { ref: "John 15:5", text: "I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit." },
  { ref: "John 15:13", text: "Greater love has no one than this: to lay down one's life for one's friends." },
  { ref: "John 16:33", text: "In this world you will have trouble. But take heart! I have overcome the world." },
  { ref: "John 17:17", text: "Sanctify them by the truth; your word is truth." },

  // ═══════════════════════════════════════════════════════════════
  //  ACTS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Acts 1:8", text: "But you will receive power when the Holy Spirit comes on you." },
  { ref: "Acts 2:38", text: "Repent and be baptized, every one of you, in the name of Jesus Christ for the forgiveness of your sins." },
  { ref: "Acts 4:12", text: "Salvation is found in no one else, for there is no other name under heaven given to mankind by which we must be saved." },
  { ref: "Acts 4:31", text: "After they prayed, the place where they were meeting was shaken." },
  { ref: "Acts 17:11", text: "Now the Berean Jews were of more noble character than those in Thessalonica, for they received the message with great eagerness and examined the Scriptures every day." },
  { ref: "Acts 20:35", text: "In everything I did, I showed you that by this kind of hard work we must help the weak, remembering the words the Lord Jesus himself said: 'It is more blessed to give than to receive.'" },

  // ═══════════════════════════════════════════════════════════════
  //  ROMANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Romans 5:3-4", text: "We also glory in our sufferings, because we know that suffering produces perseverance; perseverance, character; and character, hope." },
  { ref: "Romans 5:8", text: "But God demonstrates his own love for us in this: While we were still sinners, Christ died for us." },
  { ref: "Romans 8:1", text: "Therefore, there is now no condemnation for those who are in Christ Jesus." },
  { ref: "Romans 8:18", text: "I consider that our present sufferings are not worth comparing with the glory that will be revealed in us." },
  { ref: "Romans 8:28", text: "And we know that in all things God works for the good of those who love him." },
  { ref: "Romans 8:31", text: "If God is for us, who can be against us?" },
  { ref: "Romans 8:37", text: "In all these things we are more than conquerors through him who loved us." },
  { ref: "Romans 8:38-39", text: "For I am convinced that neither death nor life... will be able to separate us from the love of God." },
  { ref: "Romans 10:9", text: "If you declare with your mouth, 'Jesus is Lord,' and believe in your heart that God raised him from the dead, you will be saved." },
  { ref: "Romans 12:1", text: "Therefore, I urge you, brothers and sisters, in view of God's mercy, to offer your bodies as a living sacrifice." },
  { ref: "Romans 12:2", text: "Do not conform to the pattern of this world, but be transformed by the renewing of your mind." },
  { ref: "Romans 12:21", text: "Do not be overcome by evil, but overcome evil with good." },
  { ref: "Romans 13:1", text: "Let everyone be subject to the governing authorities, for there is no authority except that which God has established." },
  { ref: "Romans 15:7", text: "Accept one another, then, just as Christ accepted you." },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 CORINTHIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Corinthians 10:13", text: "No temptation has overtaken you except what is common to mankind. And God is faithful; he will not let you be tempted beyond what you can bear." },
  { ref: "1 Corinthians 13:4-7", text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It does not dishonor others, it is not self-seeking, it is not easily angered, it keeps no record of wrongs. Love does not delight in evil but rejoices with the truth. It always protects, always trusts, always hopes, always perseveres." },
  { ref: "1 Corinthians 13:13", text: "And now these three remain: faith, hope and love. But the greatest of these is love." },
  { ref: "1 Corinthians 15:58", text: "Stand firm. Let nothing move you. Always give yourselves fully to the work of the Lord." },
  { ref: "1 Corinthians 16:14", text: "Do everything in love." },
  { ref: "2 Corinthians 4:8-9", text: "We are hard pressed on every side, but not crushed; perplexed, but not in despair; persecuted, but not abandoned; struck down, but not destroyed." },
  { ref: "2 Corinthians 4:16", text: "Therefore we do not lose heart. Though outwardly we are wasting away, yet inwardly we are being renewed day by day." },
  { ref: "2 Corinthians 5:17", text: "Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!" },
  { ref: "2 Corinthians 9:7", text: "Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver." },
  { ref: "2 Corinthians 12:9", text: "But he said to me, \"My grace is sufficient for you, for my power is made perfect in weakness.\"" },

  // ═══════════════════════════════════════════════════════════════
  //  GALATIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Galatians 5:1", text: "It is for freedom that Christ has set us free." },
  { ref: "Galatians 5:22-23", text: "But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control." },
  { ref: "Galatians 6:9", text: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up." },
  { ref: "Galatians 6:10", text: "Therefore, as we have opportunity, let us do good to all people." },

  // ═══════════════════════════════════════════════════════════════
  //  EPHESIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Ephesians 2:8-9", text: "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God — not by works, so that no one can boast." },
  { ref: "Ephesians 3:20", text: "Now to him who is able to do immeasurably more than all we ask or imagine, according to his power that is at work within us." },
  { ref: "Ephesians 4:29", text: "Do not let any unwholesome talk come out of your mouths, but only what is helpful for building others up." },
  { ref: "Ephesians 5:8", text: "For you were once darkness, but now you are light in the Lord." },
  { ref: "Ephesians 6:10", text: "Finally, be strong in the Lord and in his mighty power." },
  { ref: "Ephesians 6:16-17", text: "In addition to all this, take up the shield of faith... Take the helmet of salvation and the sword of the Spirit, which is the word of God." },

  // ═══════════════════════════════════════════════════════════════
  //  PHILIPPIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Philippians 1:6", text: "Being confident of this, that he who began a good work in you will carry it on to completion." },
  { ref: "Philippians 1:21", text: "For to me, to live is Christ and to die is gain." },
  { ref: "Philippians 2:3", text: "Do nothing out of selfish ambition or vain conceit. Rather, in humility value others above yourselves." },
  { ref: "Philippians 3:14", text: "I press on toward the goal to win the prize for which God has called me heavenward in Christ Jesus." },
  { ref: "Philippians 4:6-7", text: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and minds." },
  { ref: "Philippians 4:8", text: "Finally, brothers and sisters, whatever is true, whatever is noble, whatever is right, whatever is pure, whatever is lovely, whatever is admirable — if anything is excellent or praiseworthy — think about such things." },
  { ref: "Philippians 4:13", text: "I can do all this through him who gives me strength." },
  { ref: "Philippians 4:19", text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus." },

  // ═══════════════════════════════════════════════════════════════
  //  COLOSSIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Colossians 3:15", text: "Let the peace of Christ rule in your hearts." },
  { ref: "Colossians 3:23", text: "Whatever you do, work at it with all your heart, as working for the Lord." },
  { ref: "Colossians 4:6", text: "Let your conversation be always full of grace, seasoned with salt." },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 THESSALONIANS
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Thessalonians 5:11", text: "Therefore encourage one another and build each other up." },
  { ref: "1 Thessalonians 5:16-18", text: "Rejoice always, pray continually, give thanks in all circumstances." },
  { ref: "2 Thessalonians 3:3", text: "But the Lord is faithful, and he will strengthen you and protect you from the evil one." },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 TIMOTHY
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Timothy 4:12", text: "Don't let anyone look down on you because you are young, but set an example." },
  { ref: "1 Timothy 6:10", text: "For the love of money is a root of all kinds of evil." },
  { ref: "1 Timothy 6:12", text: "Fight the good fight of the faith, lay hold of eternal life." },
  { ref: "2 Timothy 1:7", text: "For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline." },
  { ref: "2 Timothy 2:15", text: "Do your best to present yourself to God as one approved, a worker who does not need to be ashamed." },
  { ref: "2 Timothy 4:7", text: "I have fought the good fight, I have finished the race, I have kept the faith." },

  // ═══════════════════════════════════════════════════════════════
  //  TITUS / PHILEMON
  // ═══════════════════════════════════════════════════════════════
  { ref: "Titus 2:11", text: "For the grace of God has appeared that offers salvation to all people." },
  { ref: "Philemon 1:6", text: "I pray that your partnership with us in the faith may be effective in deepening your understanding of every good thing we share." },

  // ═══════════════════════════════════════════════════════════════
  //  HEBREWS
  // ═══════════════════════════════════════════════════════════════
  { ref: "Hebrews 4:12", text: "For the word of God is alive and active. Sharper than any double-edged sword." },
  { ref: "Hebrews 4:16", text: "Let us then approach God's throne of grace with confidence." },
  { ref: "Hebrews 6:12", text: "We do not want you to become lazy, but to imitate those who through faith and patience inherit what has been promised." },
  { ref: "Hebrews 10:23", text: "Let us hold unswervingly to the hope we profess, for he who promised is faithful." },
  { ref: "Hebrews 10:24-25", text: "And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together." },
  { ref: "Hebrews 11:1", text: "Now faith is confidence in what we hope for and assurance about what we do not see." },
  { ref: "Hebrews 11:6", text: "And without faith it is impossible to please God, because anyone who comes to him must believe that he exists and that he rewards those who earnestly seek him." },
  { ref: "Hebrews 12:1-2", text: "Let us run with perseverance the race marked out for us, fixing our eyes on Jesus, the pioneer and perfecter of faith." },
  { ref: "Hebrews 12:14", text: "Make every effort to live in peace with everyone and to be holy." },
  { ref: "Hebrews 13:5", text: "Never will I leave you; never will I forsake you." },
  { ref: "Hebrews 13:8", text: "Jesus Christ is the same yesterday and today and forever." },
  { ref: "Hebrews 13:16", text: "And do not forget to do good and to share with others, for with such sacrifices God is pleased." },

  // ═══════════════════════════════════════════════════════════════
  //  JAMES
  // ═══════════════════════════════════════════════════════════════
  { ref: "James 1:2-4", text: "Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance." },
  { ref: "James 1:5", text: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you." },
  { ref: "James 1:17", text: "Every good and perfect gift is from above, coming down from the Father of the heavenly lights." },
  { ref: "James 2:17", text: "In the same way, faith by itself, if it is not accompanied by action, is dead." },
  { ref: "James 4:7", text: "Submit yourselves, then, to God. Resist the devil, and he will flee from you." },
  { ref: "James 4:10", text: "Humble yourselves before the Lord, and he will lift you up." },
  { ref: "James 5:16", text: "Therefore confess your sins to each other and pray for each other so that you may be healed." },

  // ═══════════════════════════════════════════════════════════════
  //  1 & 2 PETER
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 Peter 2:9", text: "But you are a chosen people, a royal priesthood, a holy nation, God's special possession." },
  { ref: "1 Peter 3:15", text: "But in your hearts revere Christ as Lord." },
  { ref: "1 Peter 4:8", text: "Above all, love each other deeply, because love covers over a multitude of sins." },
  { ref: "1 Peter 5:6-7", text: "Humble yourselves, therefore, under God's mighty hand, that he may lift you up in due time. Cast all your anxiety on him because he cares for you." },
  { ref: "1 Peter 5:10", text: "And the God of all grace, who called you to his eternal glory in Christ, after you have suffered a little while, will himself restore you and make you strong." },
  { ref: "2 Peter 1:3", text: "His divine power has given us everything we need for a godly life through our knowledge of him." },
  { ref: "2 Peter 3:9", text: "The Lord is not slow in keeping his promise, as some understand slowness. Instead he is patient with you." },

  // ═══════════════════════════════════════════════════════════════
  //  1, 2 & 3 JOHN
  // ═══════════════════════════════════════════════════════════════
  { ref: "1 John 1:9", text: "If we confess our sins, he is faithful and just and will forgive us our sins and purify us from all unrighteousness." },
  { ref: "1 John 3:1", text: "See what great love the Father has lavished on us, that we should be called children of God!" },
  { ref: "1 John 3:16-17", text: "This is how we know what love is: Jesus Christ laid down his life for us. And we ought to lay down our lives for our brothers and sisters." },
  { ref: "1 John 4:7", text: "Dear friends, let us love one another, for love comes from God." },
  { ref: "1 John 4:18", text: "There is no fear in love. But perfect love drives out fear." },
  { ref: "1 John 5:14", text: "This is the confidence we have in approaching God: that if we ask anything according to his will, he hears us." },
  { ref: "2 John 1:6", text: "And this is love: that we walk in obedience to his commands." },
  { ref: "3 John 1:2", text: "Dear friend, I pray that you may enjoy good health and that all may go well with you, even as your soul is getting along well." },

  // ═══════════════════════════════════════════════════════════════
  //  JUDE
  // ═══════════════════════════════════════════════════════════════
  { ref: "Jude 1:24-25", text: "To him who is able to keep you from stumbling and to present you before his glorious presence without fault and with great joy." },

  // ═══════════════════════════════════════════════════════════════
  //  REVELATION
  // ═══════════════════════════════════════════════════════════════
  { ref: "Revelation 3:5", text: "The one who is victorious will, like them, be dressed in white." },
  { ref: "Revelation 3:20", text: "Here I am! I stand at the door and knock. If anyone hears my voice and opens the door, I will come in and eat with that person." },
  { ref: "Revelation 21:4", text: "He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain." },
  { ref: "Revelation 22:5", text: "There will be no more night. They will not need the light of a lamp or the light of the sun, for the Lord God will give them light." },
  { ref: "Revelation 22:20", text: "He who testifies to these things says, \"Yes, I am coming soon.\"" },
];

// Psalms 82:6 appears 3× in the array above; this gives it ~3× the chance
// of being selected as a "random" verse, plus getMotto() always returns it.

function getVerse() {
  return VERSES[Math.floor(Math.random() * VERSES.length)];
}

function getMotto() {
  return VERSES.find(v => v.ref === "Psalms 82:6");
}

function getProverb() {
  const proverbs = VERSES.filter(v => v.ref.startsWith("Proverbs"));
  return proverbs[Math.floor(Math.random() * proverbs.length)];
}

function getPsalm() {
  const psalms = VERSES.filter(v => v.ref.startsWith("Psalms") && v.ref !== "Psalms 82:6");
  return psalms[Math.floor(Math.random() * psalms.length)];
}

function getNewTestament() {
  const nt = VERSES.filter(v =>
    v.ref.startsWith("Matthew") || v.ref.startsWith("Mark") || v.ref.startsWith("Luke") ||
    v.ref.startsWith("John") || v.ref.startsWith("Acts") || v.ref.startsWith("Romans") ||
    v.ref.startsWith("1 Corinthians") || v.ref.startsWith("2 Corinthians") ||
    v.ref.startsWith("Galatians") || v.ref.startsWith("Ephesians") ||
    v.ref.startsWith("Philippians") || v.ref.startsWith("Colossians") ||
    v.ref.startsWith("Hebrews") || v.ref.startsWith("James") ||
    v.ref.startsWith("1 Peter") || v.ref.startsWith("2 Peter") ||
    v.ref.startsWith("1 John") || v.ref.startsWith("Revelation")
  );
  return nt[Math.floor(Math.random() * nt.length)];
}

function appendVerse(text) {
  const v = getVerse();
  return `${text}\n\n📖 *${v.ref}*\n_${v.text}_`;
}

function appendMotto(text) {
  const v = getMotto();
  return `${text}\n\n📖 *${v.ref}*\n_${v.text}_`;
}

function verseLine() {
  const v = getVerse();
  return `📖 *${v.ref}*: _${v.text}_`;
}

module.exports = {
  getVerse,
  getMotto,
  getProverb,
  getPsalm,
  getNewTestament,
  appendVerse,
  appendMotto,
  verseLine,
  VERSES,
};
