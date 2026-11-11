// The Falling Petal, word for word from the 2D game's CAMPAIGNS (public/games/era-clash/index.html).
// Kenne's placeholder history: keep prologue / 4 chapters / epilogue, 2 paragraphs each, when replacing it.
export interface Foe { c: string; n: string; hp: number; dm: number; boss?: boolean }
export interface Chapter { title: string; place: string; stage: string; allies: string[]; story: string[]; foes: Foe[] }
export interface Tale { warrior: string; title: string; era: string; intro: string[]; finale: string[]; chapters: Chapter[] }
export const FALLING_PETAL: Tale = {
  "warrior": "samurai",
  "title": "The Falling Petal",
  "era": "Japan · The Sengoku Age, c. 1570",
  "intro": [
    "In the age the chronicles call Sengoku — the land at war with itself — a hundred lords raised banners, and every banner cast a shadow where farmers tried to live. In the mountain province of Kōyama, Lord Takamine kept one valley at peace, and the valley loved him for it.",
    "His sword-arm was a quiet duelist named Haru, called the Crimson Blade, whose draw no living eye had ever followed. When smoke rose from the coastal villages in the spring of the war's worst year, Lord Takamine did not send an army. He sent Haru, and the companions Haru chose for the road."
  ],
  "finale": [
    "The valley kept its harvest that year, and the year after. Lord Takamine raised a cup to the companions at the gate and asked what reward could answer such service. Haru asked only that the road south be mended, so the next travelers would arrive before the raiders did.",
    "They say the Crimson Blade was seen once more at dawn, practicing his draw beneath the cherry trees, petals falling around a sword too fast to see. Then the tale, like all tales of that warring age, passes to whoever will carry it next."
  ],
  "chapters": [
    {
      "title": "Smoke Over the Valley",
      "place": "The coastal villages",
      "stage": "japan",
      "allies": [
        "monk",
        "knight"
      ],
      "story": [
        "The wakō came with the tide — sea raiders out of the island channels, bold as gulls and twice as hungry. They fired the storehouses of two villages before the bell at the watchtower finished its first song.",
        "Haru reached the shore road at a run, Chen the monk at his shoulder and Roland the wandering knight still buckling his sword-belt. The raiders laughed to see three against their landing party. It was the last easy laugh of their spring."
      ],
      "foes": [
        {
          "c": "viking",
          "n": "Wakō Raider",
          "hp": 0.55,
          "dm": 0.75
        },
        {
          "c": "viking",
          "n": "Wakō Raider",
          "hp": 0.55,
          "dm": 0.75
        },
        {
          "c": "viking",
          "n": "Wakō Oarsman",
          "hp": 0.6,
          "dm": 0.8
        },
        {
          "c": "viking",
          "n": "Wakō Raider",
          "hp": 0.6,
          "dm": 0.8
        }
      ]
    },
    {
      "title": "The Ford of Petals",
      "place": "The river crossing",
      "stage": "china",
      "allies": [
        "monk",
        "gladiator"
      ],
      "story": [
        "Word came that the sōhei — the warrior monks of the mountain temples, spearmen feared in every chronicle of the age — had seized the river ford and were taxing, then turning back, every cart of relief rice bound for the valley.",
        "Their abbot owed the raiders a debt, or feared them; the tale argues both. What is certain is that the ford ran red with petals that morning, and the spears of the mountain did not expect a monk of Shaolin to wade out and ask, politely, for the road back."
      ],
      "foes": [
        {
          "c": "monk",
          "n": "Sōhei Spearman",
          "hp": 0.6,
          "dm": 0.8
        },
        {
          "c": "monk",
          "n": "Sōhei Spearman",
          "hp": 0.6,
          "dm": 0.8
        },
        {
          "c": "monk",
          "n": "Sōhei of the Mountain",
          "hp": 0.65,
          "dm": 0.85
        },
        {
          "c": "samurai",
          "n": "Hired Blade",
          "hp": 0.8,
          "dm": 0.9
        },
        {
          "c": "monk",
          "n": "Sōhei Spearman",
          "hp": 0.65,
          "dm": 0.85
        }
      ]
    },
    {
      "title": "Fire in the Mountain Pass",
      "place": "The pass road",
      "stage": "norse",
      "allies": [
        "knight",
        "gladiator"
      ],
      "story": [
        "Beaten at shore and ford, the raiders did what beaten raiders do: they hired swords. Deserter ashigaru and masterless rōnin ambushed the companions in the high pass, where the snow keeps one road and the cliffs keep the rest.",
        "It is a poor place to fight a battle and a fine place to end one. Haru took the road's narrow heart and held it the way a gate holds a road — by simply refusing, again and again, to be moved."
      ],
      "foes": [
        {
          "c": "samurai",
          "n": "Rōnin Deserter",
          "hp": 0.65,
          "dm": 0.85
        },
        {
          "c": "viking",
          "n": "Wakō Raider",
          "hp": 0.6,
          "dm": 0.8
        },
        {
          "c": "samurai",
          "n": "Rōnin Deserter",
          "hp": 0.7,
          "dm": 0.85
        },
        {
          "c": "monk",
          "n": "Sōhei Spearman",
          "hp": 0.65,
          "dm": 0.85
        },
        {
          "c": "samurai",
          "n": "Masterless Sword",
          "hp": 0.85,
          "dm": 0.9
        },
        {
          "c": "viking",
          "n": "Wakō Oarsman",
          "hp": 0.65,
          "dm": 0.8
        }
      ]
    },
    {
      "title": "The Southern Captain",
      "place": "The castle town",
      "stage": "italy",
      "allies": [
        "monk",
        "knight"
      ],
      "story": [
        "At the root of the raids sat a captain of the nanban — the southern barbarians, traders out of Portugal whose ships had ridden the black current to Japan a generation before, bringing clocks, cloth, and guns. This one had decided a valley of his own was worth more than honest cargo.",
        "He was, by every account, a magnificent swordsman, armored in the steel of two worlds. Haru bowed to him in the piazza of the castle town as one craftsman to another. Then the last battle of the valley began."
      ],
      "foes": [
        {
          "c": "samurai",
          "n": "Captain's Guard",
          "hp": 0.75,
          "dm": 0.9
        },
        {
          "c": "samurai",
          "n": "Captain's Guard",
          "hp": 0.75,
          "dm": 0.9
        },
        {
          "c": "knight",
          "n": "The Southern Captain",
          "hp": 1.7,
          "dm": 1.15,
          "boss": true
        },
        {
          "c": "viking",
          "n": "Wakō Raider",
          "hp": 0.65,
          "dm": 0.85
        }
      ]
    }
  ]
};
