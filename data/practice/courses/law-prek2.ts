import type { CourseModule } from '../courseModule';
import { mcq } from '../courseKit';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'law-prek2',
    label: 'Rules, Fairness and Helping Each Other',
    blurb: 'Why we have rules, how to take turns, what is fair, how to tell the truth, and who helps us stay safe.',
    accent: '#C9A227',
    framework: 'plajah-law',
    tracks: [
      {
        id: 'law-prek2.t1',
        title: 'Rules and Fairness',
        blurb: 'What rules are for, where we find them, and what makes things fair.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'law-prek2.l01',
            title: 'Why We Have Rules',
            blurb: 'Rules help everyone stay safe and get along.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'purpose of rules' }],
            body: `A rule is a plan that tells us how to act. Rules help people stay safe. They help people be fair. They help people get along.

Think about a playground. What if one child pushed on the slide? Someone could get hurt. So there is a rule: one child at a time, and go down feet first. The rule is not there to spoil the fun. It is there so everyone can have fun and nobody gets hurt.

Think about a game. If no one knew the rules of tag, the game would turn into a big muddle. Every player would think something different. Rules tell everyone the same plan, so the game works.

Good rules are for everybody. A grown-up follows rules too. A bus driver stops at a red light. A teacher waits her turn in the lunch line.

Rules do not mean you are in trouble. Rules are like a map. They show us a good way to go together.

A good rule has a reason. If you do not know the reason for a rule, you can ask a grown-up kindly. "Why do we have this rule?" is a smart question.`,
          },
          {
            id: 'law-prek2.l02',
            title: 'Rules at Home, at School and at Play',
            blurb: 'Rules are in lots of places, and they can be different in each one.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'rules in different places' }],
            body: `We find rules in many places. At home, a rule might be: wash your hands before you eat. Or: put your toys away. At school, a rule might be: raise your hand to talk. Or: walk in the hall. At a pool, a rule might be: no running. At a library, a rule might be: use a quiet voice.

Different places have different rules because they are different places. Running is fine at a park. Running in a hallway could make a child fall or bump into someone. So the hallway has a "walk" rule.

Some rules are the same almost everywhere. Be kind. Do not hit. Do not take things that belong to someone else. These are rules that keep people safe and happy wherever they are.

Some rules are written down on signs. A stop sign tells drivers to stop. Some rules are spoken, like "Please sit down while you eat." Some rules everyone just learns, like saying "please" and "thank you."

When you go to a new place, it is a good idea to look and listen for the rules. You can ask, "What are the rules here?" Then you will know how to be safe and kind in that place.`,
          },
          {
            id: 'law-prek2.l03',
            title: 'Taking Turns and Sharing',
            blurb: 'Turns let everyone have a chance.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'fairness through turn-taking' }],
            body: `Sometimes there is only one swing and many children. How can everyone have a chance? We take turns.

Taking turns means one person goes first, then the next person goes, and so on. Everyone gets a chance. It is a fair way to share.

Waiting for your turn can be hard. It helps to count to ten, or to watch the person who is going now, or to think about what you will do when it is your turn. You can say, "Can I have a turn when you are done?" Your friend can say, "Yes, in a minute."

Sometimes a timer helps. When the timer rings, the swing goes to the next child. A timer is fair because it is the same for everyone.

Sharing is a little different. Sharing means letting someone use something too, or giving some of it. If you have a bag of crackers, you might share some. If you have a toy, you might let a friend play with it for a while.

Sharing and turn-taking are both kind. They are also both fair. When we take turns and share, nobody is left out, and everybody feels glad to play together.`,
          },
          {
            id: 'law-prek2.l04',
            title: 'Fair and Unfair',
            blurb: 'Fair does not always mean exactly the same.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'fairness' }],
            body: `Fair means that everyone is treated in a way that is right and equal. Unfair means that someone gets treated worse, or left out, for no good reason.

Here is an unfair thing. A teacher gives stickers to some children but forgets other children, just because she likes the first group more. That is not fair. Everyone who did the work should get a sticker.

Here is another unfair thing. In a game, one player changes the rules in the middle so that only he can win. The others did not agree to that. That is not fair.

Sometimes fair does not mean everyone gets exactly the same. Imagine that one child wears a size small shoe and another wears a size big shoe. If a grown-up gives both children size small shoes, that is the same, but it is not fair. Fair means each child gets what they need. A child who is hurt may need a bandage. A child who is not hurt does not need one. That is still fair.

When something feels unfair, you can stop and ask, "Is everyone getting a chance? Are we being kind to everyone?" If not, you can use calm words to say what you think. We will learn about this soon.`,
          },
          {
            id: 'law-prek2.l05',
            title: 'Rules Can Change',
            blurb: 'People make rules, and people can make better ones.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'rules are made by people' }],
            body: `Rules are made by people. That means people can also change them when a rule is not working.

Imagine a class has a rule: only two children can use the art table at once. But the class gets bigger, and many children want to paint. The teacher and the class talk about it. They decide: four children at a time, and everyone gets a turn each day. The rule changed because the class needed something better.

Some rules should not change, because they keep us safe. "Hold a grown-up's hand when you cross a busy road" is a good rule for a long time.

If you think a rule is not fair, here is what to do. Do not break the rule. Instead, wait for a calm moment. Then tell a grown-up kindly. You can say, "I think this rule is hard for some kids. Can we talk about it?" A good teacher or parent will listen.

Even grown-ups do this. People in a town can talk about their rules and change them. Listening to each other is how rules get better.`,
          },
        ],
      },
      {
        id: 'law-prek2.t2',
        title: 'Honesty and Responsibility',
        blurb: 'Telling the truth, respecting what belongs to others, and making things right.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'law-prek2.l06',
            title: 'Telling the Truth',
            blurb: 'Truth makes trust.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'honesty and trust' }],
            body: `Telling the truth means saying what really happened. Telling a lie means saying something that is not true, so that someone believes it.

Why does the truth matter? Because of trust. Trust means you can count on a person. If a friend always tells the truth, you can believe what they say. If someone tells lies, it is hard to believe them, even when they are telling the truth.

Sometimes telling the truth feels scary. Say a cup of juice spills because you bumped the table. You might feel worried and want to say, "I didn't do it." But if you say, "I bumped it by accident," a grown-up will usually be glad you told them. Accidents happen to everyone. Lies make the problem bigger.

Telling the truth is brave. It is also kind to others. If someone else would be blamed for what you did, the truth keeps things fair.

You can tell the truth in a gentle way. You do not have to be mean. If a friend draws a picture and you do not love it, you do not have to say, "That's bad." You can say something true and kind, like, "I like the colors you picked."

In a court, people promise to tell the truth. That shows how important truth is.`,
          },
          {
            id: 'law-prek2.l07',
            title: 'Mine, Yours and Ours',
            blurb: 'Owning things, borrowing and asking first.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'ownership and borrowing' }],
            body: `Some things belong to you. Your toothbrush is yours. A toy a grown-up gave to you is yours. We say these things are mine.

Some things belong to someone else. A friend's backpack is hers. A brother's game is his. A teacher's desk belongs to the school. We say these things are yours.

Some things belong to everybody in a group. The classroom books are ours. The playground is ours. When things are ours, we share them and take care of them.

Here is the rule: do not take something that belongs to someone else. Taking something without asking is called stealing. It is not fair, and it makes the other person sad.

What if you want to use a friend's toy? Ask first. Say, "May I please use your truck?" The friend can say yes or no. If the answer is no, that is okay. You can find something else to play with.

If the friend says yes, you are borrowing. Borrowing means you use it for a while and give it back. Take good care of it, and return it when you said you would.

If you find something that is not yours, like a mitten on the floor, give it to a grown-up so the owner can find it.`,
          },
          {
            id: 'law-prek2.l08',
            title: 'Owning Your Mistakes and Saying Sorry',
            blurb: 'Everyone makes mistakes. We can make things better.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'responsibility and apology' }],
            body: `Everyone makes mistakes. Grown-ups do too. A mistake is not the end of the world. What matters is what we do next.

Being responsible means owning what you did. If you knocked down your friend's block tower, you can say, "I did that." You do not blame someone else. Owning it is brave.

Then you can say sorry. A good sorry has a few parts. First, say what happened: "I knocked over your tower." Next, say that you are sorry: "I am sorry." Last, ask how you can fix it: "Can I help you build it again?"

Saying "sorry" is not just words. It means you care that your friend feels sad. It helps to look at your friend and use a gentle voice.

Sometimes your friend is not ready to forgive you right away. That is okay. Give them some time. Forgiving means the person lets go of being upset. You cannot make someone forgive you, but you can keep being kind.

Also, when someone says sorry to you, you can say, "Thank you for saying sorry." If you are ready, you can say, "It's okay." Then you can play together again.

Fixing a mistake is also fair. It puts things back the way they should be.`,
          },
          {
            id: 'law-prek2.l09',
            title: 'Using Words to Solve Problems',
            blurb: 'When we disagree, we can talk, not hurt.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'peaceful conflict resolution' }],
            body: `Sometimes two children want the same thing at the same time. They both feel upset. What can they do?

Hands are for helping, not for hurting. We do not hit, push or grab. We use our words.

Here are steps that can help. First, stop and take a deep breath. Second, say how you feel and what you want. You can say, "I feel mad because I want the red crayon." Third, listen to the other person. They have feelings too. Fourth, think of ways to fix it together. You could take turns. You could use a timer. You could use different crayons. You could play a different game. Fifth, choose one idea that works for both of you.

Sometimes you cannot solve it alone. That is okay. You can ask a grown-up to help. Asking for help is smart, not weak. A grown-up can listen to both children and help them find something fair.

This is a little like what judges do for grown-ups. When people cannot agree, a fair listener helps decide. For kids, the fair listener is often a teacher or a parent.

Solving problems with words keeps everyone safe, and often keeps the friendship strong.`,
          },
        ],
      },
      {
        id: 'law-prek2.t3',
        title: 'Staying Safe and Getting Help',
        blurb: 'Safe habits, community helpers, and what to do when someone is hurt or you feel unsafe.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'law-prek2.l10',
            title: 'Being Safe',
            blurb: 'Safety rules protect our bodies.',
            minutes: 4,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'child safety rules' }],
            body: `Some rules are safety rules. They protect our bodies so that we do not get hurt.

When you ride a bike or scooter, wear a helmet. A helmet protects your head. When you ride in a car, use your seat belt or car seat every time. When you cross a street, stop at the curb, look both ways, and cross with a grown-up. Stay with your grown-up in a store or at a park, and do not wander off.

At home, ask a grown-up before you use the stove, a sharp knife, or something hot. Never taste medicine or cleaning spray. Only a grown-up should give you medicine, and only the right kind.

In water, an adult must be watching. Swim only where a grown-up says it is safe. Wear a life jacket on a boat.

Fire safety is important too. Matches and lighters are for grown-ups, not children. If you hear a smoke alarm, go outside with your grown-up and stay out.

Why do we follow safety rules even when we feel fine? Because accidents happen quickly. The rule works before anything goes wrong, like a seat belt that is already on.

Safety rules are a way people take care of each other.`,
          },
          {
            id: 'law-prek2.l11',
            title: 'Helpers in Our Community',
            blurb: 'Police officers and firefighters help keep people safe.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'community helpers' }],
            body: `A community is a group of people who live and work near each other. Many helpers keep a community safe and healthy.

Firefighters put out fires and rescue people. They also teach fire safety, and they help in other emergencies. If a firefighter comes to help, you can trust them. They wear big coats and helmets that can look scary, but they are there to help you.

Police officers are rule helpers. They help people follow safety rules, like driving carefully. They help when someone is lost or when someone needs help. They help keep people safe. If you are lost and cannot find your grown-up, a police officer is a safe person to ask. Police officers have to follow rules too.

Doctors and nurses help us when we are sick or hurt. Teachers help us learn. Crossing guards help us cross the street. Bus drivers get us where we need to go. Garbage workers keep the streets clean. Many people in our community work to help each other.

In an emergency, you can call for help. In the United States, the emergency number is 9-1-1. Other places use different numbers, so ask a grown-up what the number is where you live. We only call it when it is a real emergency.

We can say "thank you" to our helpers.`,
          },
          {
            id: 'law-prek2.l12',
            title: 'Judges: Helpers Who Listen and Decide Fairly',
            blurb: 'A judge listens to everyone and follows the rules to decide.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'role of a judge' }],
            body: `Sometimes grown-ups have a big disagreement. They cannot fix it by talking. Or maybe someone may have broken an important rule. What then? There is a special helper called a judge.

A judge is a person who listens to everybody and decides what is fair. Judges work in a place called a court. In a court, there are rules too. A judge often wears a long black robe. The robe is a reminder that the judge should be fair to everyone.

A good judge does four things. A judge listens to both sides. A judge learns the facts, which means what really happened. A judge follows the rules, which we call laws. And a judge decides fairly, without picking a favorite.

You can think of a judge like a referee in a game. A referee does not play for one team. A referee watches carefully, knows the rules, and makes calls that are fair to both teams.

A judge is not the boss of everything. A judge has rules to follow too. Nobody is above the rules, not even a judge.

Most children will never need to go to court. But it is good to know that when people disagree about something big, there is a fair helper whose job is to listen.`,
          },
          {
            id: 'law-prek2.l13',
            title: 'When Someone Is Hurt',
            blurb: 'Stay calm, stay safe, and get a grown-up.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'responding when someone is hurt' }],
            body: `What should you do when a friend gets hurt? Maybe they fell off the swing and are crying. You might feel worried. That is okay. You can help.

First, stay calm and take a breath. Second, do not try to fix a big hurt yourself. Go and get a grown-up right away. Tell them where it happened and who is hurt. Say it clearly, like, "Mia fell off the slide and her arm hurts." Third, while you wait, you can stay near your friend and use kind words, like "A grown-up is coming to help you."

Do not move a friend who is badly hurt. Do not give your friend food, drink or medicine. Let a grown-up decide what to do.

If you are with a grown-up who is hurt or sick and cannot talk or wake up, that is a big emergency. If you know how, call 9-1-1 in the United States. Say your name and what happened, and stay on the phone. Answer the questions. The helper on the phone will tell you what to do. Ask a grown-up to teach you how to do this at home, so you are ready.

Helping someone who is hurt is kind. It is also brave. You are being a good helper in your community.`,
          },
          {
            id: 'law-prek2.l14',
            title: 'When You Feel Unsafe: Tell a Trusted Grown-Up',
            blurb: 'You always have the right to be safe, and to tell.',
            minutes: 5,
            asOf: '2026-10',
            anchors: [{ kind: 'concept', ref: 'child safety and telling a trusted adult' }],
            body: `Everyone deserves to feel safe. Sometimes a person or a place makes you feel scared, worried or uncomfortable. Your feeling is important. Listen to it.

Your body belongs to you. Nobody should hurt you. The parts of your body that a swimsuit covers are private. Only a doctor or a parent helping you stay clean and healthy should ever see or touch them, and they should tell you why. Nobody should ask you to touch their private parts. Nobody should ask you to keep a secret that makes you feel yucky or scared.

Some secrets are happy, like a surprise party. Those are fine and short. But if a secret makes you feel bad, tell a grown-up you trust.

You can say "No!" or "Stop!" in a strong voice. You can walk away. Then, go and tell a trusted grown-up. A trusted grown-up is someone who cares about you, like a parent, a teacher, a school counselor or a relative. Make a list with a grown-up of the people you could tell.

If the first person does not listen, keep telling. Tell another trusted grown-up until someone helps.

It is never your fault if someone makes you feel unsafe. You will not be in trouble for telling. Telling is brave, and telling is how helpers can keep you safe.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'law-prek2',
    questions: [
      // l01
      mcq('law-prek2.l01', 1, 1, 'What is the main reason we have rules on a playground?', ['To help everyone stay safe and have fun together', 'To make sure children cannot enjoy their time outside', 'To give the grown-ups something to do while watching', 'To stop children from making any friends there'], 0, 'Think about what could happen if everyone pushed on the slide.', 'Playground rules keep children from getting hurt so that everyone can play. The rules are not meant to spoil fun.'),
      mcq('law-prek2.l01', 2, 1, 'Which sentence about rules is true?', ['Grown-ups have rules to follow too, like stopping at a red light', 'Only children have to follow rules and grown-ups never do', 'Rules are only for children who have already been in trouble', 'Rules only matter when a grown-up is watching you closely'], 0, 'Think about a bus driver at a red light.', 'Rules are for everybody, including grown-ups. A rule is for a good reason, not just a punishment.'),
      mcq('law-prek2.l01', 3, 2, 'A game of tag has no agreed rules, and players disagree about who is "it." What does this show?', ['Rules give everyone the same plan, so the game can work', 'Games are better when each player makes up their own plan', 'Rules should be taken away when players start to argue', 'Only the fastest runner should decide what the rules are'], 0, 'What would happen if each person had a different plan?', 'Shared rules mean everyone knows the plan. Without them, players argue and the game falls apart.'),
      mcq('law-prek2.l01', 4, 2, 'You do not understand why a rule exists. What is a good thing to do?', ['Ask a grown-up kindly why we have that rule', 'Break the rule once to see what will happen next', 'Tell other children the rule is silly and not real', 'Wait until nobody is looking and then ignore it'], 0, 'A kind question is a smart way to learn.', 'Asking kindly is a respectful way to learn the reason. Good rules usually have a reason.'),
      // l02
      mcq('law-prek2.l02', 1, 1, 'Why might a school hallway have a rule that says "walk" while a park does not?', ['Running in a crowded hallway can make children bump or fall', 'Hallways are made of a kind of floor that cannot be run on', 'Parks do not have any children who need to be safe there', 'Teachers like quiet halls more than they like happy children'], 0, 'Think about how many people share a hallway.', 'Different places have different rules because the risks are different. A narrow hallway is a poor place to run.'),
      mcq('law-prek2.l02', 2, 1, 'Which of these is a rule that is almost the same everywhere?', ['Do not take things that belong to someone else', 'Raise your hand before speaking in the school library', 'Wear a swimming cap in every single room of a house', 'Whisper in every place you go, at all times of day'], 0, 'Think of a rule that keeps people safe and happy in any place.', 'Not taking what belongs to others is a basic rule for living with other people almost anywhere.'),
      mcq('law-prek2.l02', 3, 2, 'You visit a new place and you are not sure what the rules are. What is a good choice?', ['Look around and ask a grown-up, "What are the rules here?"', 'Decide that the place has no rules because nobody told you', 'Copy whatever the loudest child there is doing right now', 'Follow only the rules you already know from your own home'], 0, 'Rules can be different from the ones you know.', 'Looking, listening and asking helps you follow the rules of a new place so that you stay safe and kind.'),
      mcq('law-prek2.l02', 4, 2, 'A stop sign is an example of which kind of rule?', ['A rule that is written or shown on a sign', 'A rule that only works at night and not at day', 'A rule that is only for people who walk, not cars', 'A rule that a child may change if it feels like it'], 0, 'Think about how drivers know to stop.', 'A stop sign puts a rule where people can see it, so drivers know what to do.'),
      // l03
      mcq('law-prek2.l03', 1, 1, 'There is one swing and many children. What is a fair way to share it?', ['Take turns, so each child gets a chance', 'Let the tallest child keep it for the whole day', 'Let whoever grabs it first keep it as long as they like', 'Put the swing away so that no one can use it'], 0, 'Think about how everyone can get a chance.', 'Taking turns gives each child a chance, which makes it fair. A timer can help.'),
      mcq('law-prek2.l03', 2, 1, 'What can help while you wait for your turn?', ['Count to ten and watch the person who is going now', 'Pull the toy away from the child who is using it', 'Stand very close and keep saying "Hurry up, hurry up"', 'Go and tell other children the turn is taking too long'], 0, 'Waiting is hard, so calm tricks are useful.', 'Counting and watching are calm ways to wait. Grabbing or rushing is not fair to the other child.'),
      mcq('law-prek2.l03', 3, 2, 'Why is a timer a good tool for taking turns?', ['It is the same for every child, so it feels fair', 'It makes the older child always get the longest turn', 'It means nobody ever needs to wait for a turn again', 'It lets one child decide when the others are done'], 0, 'Think about whether the timer picks favorites.', 'A timer treats each child the same, which is why it helps with fairness.'),
      mcq('law-prek2.l03', 4, 2, 'What is the difference between taking turns and sharing?', ['Turns go one at a time; sharing lets someone else use or have some of it', 'Turns mean keeping something; sharing means hiding it away', 'There is no difference, because they are exactly the same thing', 'Sharing means taking it; turns mean giving it up forever'], 0, 'One is about order. The other is about letting others have some.', 'Taking turns is going one after another. Sharing is letting others use something or giving part of it. Both are fair and kind.'),
      // l04
      mcq('law-prek2.l04', 1, 1, 'A teacher gives stickers to some children who did the work, but skips others who did the work, just because she likes them less. Is that fair?', ['No, because everyone who did the work should get one', 'Yes, because teachers can pick any child they like best', 'Yes, because stickers are not important to children', 'No, because stickers are unfair to every child always'], 0, 'Ask if everyone is being treated the same for the same work.', 'It is unfair to treat someone worse for no good reason. All the children who did the work should get a sticker.'),
      mcq('law-prek2.l04', 2, 2, 'Two children need shoes. One needs a small size and one needs a big size. What is fair?', ['Give each child shoes that fit them', 'Give both children the exact same small size', 'Give both children the exact same big size', 'Give shoes only to the child who asks first'], 0, 'Fair can mean getting what you need.', 'Fair does not always mean exactly the same. Each child gets what they need so that the shoes work.'),
      mcq('law-prek2.l04', 3, 2, 'In a game, one player changes the rules in the middle so only he can win. The others never agreed. What is the problem?', ['It is unfair, because the others did not agree to the change', 'It is fair, because the player who thought of it is smartest', 'It is fair, because rules can be changed by anyone, anytime', 'It is not a problem, because games are never about fairness'], 0, 'Who got to have a say?', 'Changing the rules secretly in your own favor is unfair. Rule changes should be agreed together.'),
      mcq('law-prek2.l04', 4, 1, 'What can you ask yourself when something might be unfair?', ['"Is everyone getting a chance, and are we being kind?"', '"Which person is the loudest in the room right now?"', '"How can I get the biggest part for myself alone?"', '"Is anybody watching me while I decide what to do?"'], 0, 'The question is about everyone, not just you.', 'Asking whether everyone gets a chance and whether we are kind helps us spot what is unfair.'),
      // l05
      mcq('law-prek2.l05', 1, 1, 'Who is it that makes up the rules we follow?', ['People make rules, so people can change them too', 'Rules appear by themselves and can never be changed', 'Only animals make rules for people to follow', 'Rules are made by the weather and the seasons'], 0, 'Rules are made by whom?', 'Rules are made by people, and people can change a rule when it is not working.'),
      mcq('law-prek2.l05', 2, 2, 'A class gets bigger and the art table rule of "two at a time" is too small. What is a good thing to do?', ['Talk about it together and make a better rule', 'Ignore the rule and crowd around the table quickly', 'Never let anyone paint again so there is no problem', 'Wait for the rule to change itself over the weekend'], 0, 'Listening to each other helps rules get better.', 'When a rule is not working, people can talk and agree on a better one.'),
      mcq('law-prek2.l05', 3, 2, 'You think a rule is unfair. What is the best way to handle it?', ['Wait for a calm moment and tell a grown-up kindly', 'Break the rule loudly to show everyone it is wrong', 'Tell no one and feel angry about it for a long time', 'Make a different rule and make others follow only yours'], 0, 'Calm and kind words are most likely to be heard.', 'Speaking up calmly lets a grown-up listen, and it keeps everyone safe while the rule is talked about.'),
      mcq('law-prek2.l05', 4, 3, 'Which rule is least likely to be changed, and why?', ['Holding a grown-up\'s hand when you cross a busy road, because it keeps you safe', 'The seating chart for story time, because seats are very important', 'Which crayon box goes on which shelf, because shelves are special', 'The color of the line-up sticker, because stickers are powerful'], 0, 'Which rule protects bodies?', 'Some rules, like safety rules, stay for a long time because they protect us. Other rules about small things can change easily.'),
      // l06
      mcq('law-prek2.l06', 1, 1, 'What does it mean to tell the truth?', ['To say what really happened', 'To say whatever makes you sound the best', 'To say nothing at all about anything ever', 'To say what you think a friend wants to hear'], 0, 'Truth is about what is real.', 'Telling the truth means saying what really happened, even when it is hard.'),
      mcq('law-prek2.l06', 2, 2, 'You bumped the table by accident and juice spilled. What is the best thing to say?', ['"I bumped it by accident, and I can help clean up."', '"The juice spilled by itself while I was standing there."', '"My little cousin did it," even though he was not there.', '"I do not know anything about any juice at all."'], 0, 'Accidents happen to everyone.', 'Telling the truth about an accident usually makes grown-ups glad you were honest. A lie makes the problem bigger.'),
      mcq('law-prek2.l06', 3, 2, 'Why does it matter if a person tells lies a lot?', ['It is hard to trust them, even when they tell the truth', 'They will get taller faster than other children will', 'They will always be popular with every child they meet', 'It stops mattering as soon as the lie is forgotten'], 0, 'What does trust mean?', 'Trust means you can count on a person. Lies make it harder for others to believe what you say.'),
      mcq('law-prek2.l06', 4, 3, 'A friend shows you a picture that you do not love. Which answer is both true and kind?', ['"I like the colors you picked."', '"This is the worst picture I have ever seen."', '"It is perfect and I love every single part."', '"I will not look at it, so I cannot say."'], 0, 'You can be honest without being mean.', 'You can say something that is both true and kind. Being honest does not mean being unkind.'),
      // l07
      mcq('law-prek2.l07', 1, 1, 'What should you do before you use a friend\'s truck?', ['Ask, "May I please use your truck?"', 'Take it quietly while the friend is not looking', 'Hide it in your bag so the friend cannot play', 'Decide that it is yours because you want it'], 0, 'The first step is a polite question.', 'Asking first shows respect. The owner can say yes or no.'),
      mcq('law-prek2.l07', 2, 1, 'What does "borrowing" mean?', ['Using something for a while and then giving it back', 'Keeping something forever without telling anyone', 'Breaking something to see how it works inside', 'Giving something away so that you never see it again'], 0, 'Borrowing ends with giving back.', 'Borrowing means you use something for a short time, take care of it, and return it.'),
      mcq('law-prek2.l07', 3, 2, 'Your friend says no when you ask to use her toy. What is a good response?', ['"Okay." Then find something else to play with', 'Grab the toy because you asked nicely first', 'Tell everyone she is mean and will not share', 'Keep asking louder until she hands it over'], 0, 'The owner gets to decide.', 'The owner can say no. Accepting that is respectful, and you can find something else to do.'),
      mcq('law-prek2.l07', 4, 2, 'You find a mitten on the floor at school. What is the best thing to do?', ['Give it to a grown-up so the owner can find it', 'Put it in your pocket and take it home to keep', 'Throw it away because it is not yours or theirs', 'Hide it so that nobody will ever find it'], 0, 'Someone is probably looking for it.', 'Giving a lost item to a grown-up helps the owner get it back. Keeping it would be taking what is not yours.'),
      // l08
      mcq('law-prek2.l08', 1, 1, 'Which is a good part of saying sorry?', ['Saying what happened and asking how to fix it', 'Saying "sorry" while rolling your eyes', 'Saying that it was really someone else\'s fault', 'Saying sorry and then doing the same again'], 0, 'A good sorry tries to make it better.', 'A good sorry says what happened, says you are sorry, and offers to help fix it.'),
      mcq('law-prek2.l08', 2, 2, 'You knocked over your friend\'s block tower. What is the most responsible thing to say?', ['"I did that. I am sorry. Can I help build it again?"', '"It fell over because the table was shaky."', '"It was just a pile of blocks anyway."', '"Somebody else must have bumped into it."'], 0, 'Owning it means saying "I did that."', 'Being responsible means owning what you did and helping fix it, rather than blaming something else.'),
      mcq('law-prek2.l08', 3, 2, 'You said sorry, but your friend is still upset. What is the best next step?', ['Give your friend time and keep being kind', 'Say sorry again and again until they forgive you', 'Tell the friend they have to forgive you now', 'Stop being friends and play with someone else'], 0, 'Forgiving takes time.', 'You cannot make someone forgive you. Giving them time and being kind is the right way.'),
      mcq('law-prek2.l08', 4, 3, 'How does fixing a mistake relate to being fair?', ['It helps put things back the way they should be', 'It means the person who made the mistake must be sad', 'It means other people should do the fixing for you', 'It is not related to fairness at all in any way'], 0, 'Think about the broken tower rebuilt.', 'Fixing a mistake helps set things right for the person who was affected. That is part of fairness.'),
      // l09
      mcq('law-prek2.l09', 1, 1, 'Two children want the same red crayon. What should they do first?', ['Stop, take a breath, and use words about how they feel', 'Pull the crayon until one of them lets go of it', 'Hide the crayon so that neither child can have it', 'Tell the whole class that the other child is bad'], 0, 'Hands are for helping.', 'The first step is to stop and use calm words, not to grab or hit.'),
      mcq('law-prek2.l09', 2, 2, 'Which is a good idea for solving a crayon problem fairly?', ['Take turns with the red crayon or use a timer', 'Give the red crayon to the bigger child always', 'Throw away the red crayon so there is no fight', 'Let the louder child decide who gets the crayon'], 0, 'The idea has to work for both children.', 'A turn or a timer gives both children a fair chance. The others favor one side or remove the choice.'),
      mcq('law-prek2.l09', 3, 2, 'You cannot solve a problem with your friend. What can you do?', ['Ask a grown-up to listen to both of you', 'Give up and stop talking to your friend forever', 'Make your friend do what you want right now', 'Pretend nothing happened and feel upset inside'], 0, 'Asking for help is smart.', 'A grown-up can listen to both sides and help you find something fair.'),
      mcq('law-prek2.l09', 4, 3, 'How is a grown-up helping two children solve a problem like a judge?', ['Both listen to each side and help find a fair answer', 'Both always pick the child who is quickest to speak', 'Both wear long robes and carry a gavel everywhere', 'Both decide before hearing anything from the children'], 0, 'Think about what a fair listener does.', 'A fair helper listens to both sides before helping to decide. A judge does this for bigger disagreements.'),
      // l10
      mcq('law-prek2.l10', 1, 1, 'Why do we wear a helmet on a bike or scooter?', ['To protect our heads if we fall', 'To make the bike go much faster up hills', 'To hide our faces from the people we pass', 'To keep our hair neat while we are outside'], 0, 'Think of what is inside the helmet.', 'A helmet protects your head. Safety rules work before an accident happens.'),
      mcq('law-prek2.l10', 2, 1, 'What should you do before crossing a street?', ['Stop at the curb, look both ways, and cross with a grown-up', 'Run across fast so the cars cannot see you', 'Close your eyes and count to three before stepping', 'Wait for another child to cross and then follow'], 0, 'The first step is to stop.', 'Stopping, looking, and crossing with a grown-up keeps you safe near cars.'),
      mcq('law-prek2.l10', 3, 2, 'You hear a smoke alarm at home. What is the safest choice?', ['Go outside with your grown-up and stay out', 'Look around the house to find where the smoke is', 'Hide under your bed until the sound goes away', 'Go back for your favorite toy before leaving'], 0, 'Safety comes first, even before toys.', 'When a smoke alarm sounds, go outside right away and stay out. Toys can be replaced.'),
      mcq('law-prek2.l10', 4, 3, 'Why follow safety rules even on days when you feel fine?', ['Accidents happen quickly, and the rule helps before anything goes wrong', 'Rules only work if you feel scared when you follow them', 'Grown-ups make safety rules so they can say "no" often', 'Safety rules only matter on days when it is raining out'], 0, 'Think of a seat belt that is already buckled.', 'Safety rules work in advance. A seat belt that is already on can protect you in a sudden stop.'),
      // l11
      mcq('law-prek2.l11', 1, 1, 'Which community helper puts out fires and rescues people?', ['A firefighter', 'A crossing guard', 'A bus driver', 'A librarian'], 0, 'This helper wears a big coat and helmet.', 'Firefighters put out fires and rescue people. They also teach fire safety.'),
      mcq('law-prek2.l11', 2, 2, 'You are lost in a store and cannot find your grown-up. Who is a safe person to ask for help?', ['A police officer or a worker in the store', 'A stranger who offers you candy outside', 'Nobody, you should hide until night comes', 'Any person who asks you to come with them'], 0, 'Look for someone whose job is to help.', 'A police officer or store worker is a good person to ask. Never go off with someone who asks you to come with them.'),
      mcq('law-prek2.l11', 3, 2, 'Why are police officers called "rule helpers"?', ['They help people follow safety rules and help people who need it', 'They make up new rules for people each morning', 'They decide who gets to break the rules and who cannot', 'They are never required to follow any rules themselves'], 0, 'Police help people be safe.', 'Police officers help people follow safety rules and help people who are in trouble. They follow rules too.'),
      mcq('law-prek2.l11', 4, 3, 'When is it right to call 9-1-1 in the United States?', ['In a real emergency, when someone needs help right now', 'Whenever you are bored and want someone to talk to', 'When you want to ask what time the park closes', 'As a game to see how fast the helpers can come'], 0, 'Emergency numbers are only for emergencies.', 'Call only in a real emergency. Calling for fun can keep helpers away from someone who really needs them.'),
      // l12
      mcq('law-prek2.l12', 1, 1, 'What does a judge do?', ['Listens to everybody and decides what is fair by following the rules', 'Plays on one team so that the team will win', 'Makes new rules for children at recess only', 'Chooses the person who tells the best stories'], 0, 'A judge is like a referee.', 'A judge listens to both sides, learns the facts, follows the law, and decides fairly.'),
      mcq('law-prek2.l12', 2, 1, 'Where does a judge usually work?', ['In a court', 'In a swimming pool', 'On a playground', 'In a bakery'], 0, 'Courts are special places with rules.', 'Judges work in courts, which are places where disagreements and laws are handled fairly.'),
      mcq('law-prek2.l12', 3, 2, 'How is a judge like a referee in a game?', ['Neither plays for one team; both know the rules and try to be fair', 'Both always pick the team with the most fans cheering', 'Both are allowed to change the rules in the middle', 'Both decide who wins before the game even begins'], 0, 'Think of who a referee plays for.', 'A referee and a judge do not take a side. They know the rules and try to be fair to everyone.'),
      mcq('law-prek2.l12', 4, 3, 'Why is it important that a judge listens to both sides?', ['Because a fair choice needs all the facts from everyone', 'Because a judge enjoys hearing people talk for hours', 'Because the louder side is always the one that is right', 'Because judges are not allowed to make any decisions'], 0, 'A fair choice needs more than one story.', 'If you hear only one side, you can miss important facts. Listening to both helps a judge be fair.'),
      // l13
      mcq('law-prek2.l13', 1, 1, 'A friend falls off the slide and is crying. What should you do first?', ['Stay calm and get a grown-up right away', 'Pick your friend up and carry them to the bench', 'Run away so that you do not get blamed', 'Give your friend some of your juice or snack'], 0, 'Big hurts need a grown-up.', 'Get a grown-up right away. Do not move a badly hurt child or give food or drink.'),
      mcq('law-prek2.l13', 2, 2, 'You tell a grown-up about a hurt friend. Which message is the most helpful?', ['"Mia fell off the slide and her arm hurts."', '"Something happened, you need to come now."', '"Everyone is running around and being loud."', '"I think there might be a problem somewhere."'], 0, 'Say who, what and where.', 'A clear message tells who is hurt and what happened so the grown-up can help quickly.'),
      mcq('law-prek2.l13', 3, 2, 'While you wait for a grown-up to come, what is a kind thing you can do?', ['Stay near your friend and say, "A grown-up is coming."', 'Tell your friend that it does not really hurt', 'Take pictures to show your other friends later', 'Leave your friend alone so they can be quiet'], 0, 'Kind words can help your friend feel safer.', 'Staying nearby and speaking kindly helps your friend feel safe while help is on the way.'),
      mcq('law-prek2.l13', 4, 3, 'A grown-up at home is sick, cannot wake up, and no other grown-up is there. What is the best thing to do if you know how?', ['Call 9-1-1 in the United States, say what happened, and stay on the phone', 'Wait quietly in your room until the grown-up wakes up', 'Try to give the grown-up some medicine from the cabinet', 'Go outside and play so that you are not frightened'], 0, 'The helper on the phone will tell you what to do.', 'This is a real emergency. Call the emergency number, say what happened, and follow the helper\'s directions. Do not give medicine.'),
      // l14
      mcq('law-prek2.l14', 1, 1, 'Whose body belongs to you?', ['You. Your body belongs to you.', 'Only the grown-ups who live in your home', 'Only the doctor who looks at it each year', 'Nobody, because bodies belong to everyone'], 0, 'The answer is about you.', 'Your body belongs to you. Nobody should hurt you or touch your private parts in ways that make you feel unsafe.'),
      mcq('law-prek2.l14', 2, 1, 'Who is a trusted grown-up you could tell?', ['A parent, teacher, school counselor or relative who cares about you', 'A person who asks you to keep every secret from everyone', 'Someone you have just met online who says to trust them', 'Any person who says they are your friend but is a stranger'], 0, 'Trusted grown-ups care about your safety.', 'A trusted grown-up cares about you and will help you stay safe. A new stranger who asks for secrets is not one.'),
      mcq('law-prek2.l14', 3, 2, 'Someone asks you to keep a secret that makes you feel yucky and scared. What should you do?', ['Tell a trusted grown-up, even if you were asked not to', 'Keep it secret forever because you promised', 'Wait a year to see if the feeling goes away', 'Tell the person who asked that you will keep it'], 0, 'Some secrets are not safe to keep.', 'A secret that makes you feel scared or uncomfortable should be told to a trusted grown-up. You will not be in trouble.'),
      mcq('law-prek2.l14', 4, 3, 'You told one grown-up that you felt unsafe, but they did not listen. What is the best next step?', ['Keep telling another trusted grown-up until someone helps', 'Decide that it must not be important after all', 'Stop telling people so you do not bother anyone', 'Wait for the person who made you feel unsafe to stop'], 0, 'Keep telling.', 'If the first person does not help, tell another trusted grown-up. It is never your fault, and someone should listen.'),
    ],
  },
};
