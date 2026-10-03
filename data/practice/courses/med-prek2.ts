import type { CourseModule } from '../courseModule';
import type { Question } from '../types';
import { mcq } from '../courseKit';

const ID = 'med-prek2';
const lid = (n: number) => `${ID}.l${String(n).padStart(2, '0')}`;

interface L { n: number; title: string; blurb: string; minutes: number; body: string }
const lesson = (l: L) => ({ id: lid(l.n), title: l.title, blurb: l.blurb, minutes: l.minutes, body: l.body, asOf: '2026-10', anchors: [] as never[] });

const L01: L = { n: 1, title: 'My Body Parts', blurb: 'Heads, hands, and everything that helps you move and play.', minutes: 4, body:
`Your body is amazing. It has many parts, and each part has a job.

Your head sits on top. Inside your head is your brain. Your brain is like the boss of your body. It helps you think, remember, and tell your body what to do.

You have two eyes for seeing and two ears for hearing. You have a nose for smelling and a mouth for eating, talking, and smiling. Your arms and hands help you wave, hold, and draw. Your legs and feet help you walk, run, and jump.

Inside your body there are parts you cannot see. Your heart pumps blood all around you. Your lungs help you breathe in air. Your stomach helps break down the food you eat. Your bones are strong and hold you up, and your muscles help you move.

Every body is a little different. Some people are tall and some are short. Some people use glasses, a wheelchair, or a hearing aid. All bodies are special, and all bodies deserve care.` };

const L02: L = { n: 2, title: 'My Five Senses', blurb: 'See, hear, smell, taste, and touch: how you learn about the world.', minutes: 4, body:
`You have five senses. Your senses tell your brain what is happening around you.

You see with your eyes. You can see colors, shapes, and faces. You hear with your ears. You can hear music, a dog barking, and a friend saying hello.

You smell with your nose. Cookies baking smell yummy. You taste with your tongue. Your tongue can tell if food is sweet, sour, salty, or bitter. You touch with your skin. Your skin can feel if something is soft, rough, hot, cold, or sharp.

Your senses help keep you safe. You see a car and you stop. You hear a siren and you move out of the way. You feel a hot cup and you pull your hand back. You smell smoke and you tell a grown-up.

Try this game. Close your eyes and listen. What can you hear? Then open your eyes and look. What can you see? Using one sense at a time helps you notice more.` };

const L03: L = { n: 3, title: 'Inside Me: Heart, Lungs, and Brain', blurb: 'Three busy helpers that work all day and all night.', minutes: 4, body:
`Some of your body helpers work inside you, all day and all night. You do not even have to ask them.

Your heart is about the size of your fist. It squeezes again and again to push blood around your body. Blood carries good things your body needs. You can feel your heart beating. Put your hand on your chest after you run. Does it beat faster?

Your lungs are inside your chest. When you breathe in, your lungs fill up with air, like balloons. Air has a part called oxygen that your body needs. When you breathe out, the air goes back out.

Your brain is inside your head, and your skull keeps it safe like a helmet. Your brain helps you think, learn, feel, and move. It also takes care of things you never think about, like breathing and your heartbeat.

You can help these helpers. Running and playing make your heart strong. Deep breaths feel calming. A helmet protects your head when you ride a bike.` };

const L04: L = { n: 4, title: 'Germs and Washing Hands', blurb: 'Tiny things you cannot see, and how soap sends them away.', minutes: 4, body:
`Germs are very, very tiny living things. They are so small that you cannot see them with just your eyes. Most germs are harmless. A few can make us sick, like when we get a cold or a tummy ache.

Germs can get on your hands. They get on your hands when you cough into them, play outside, touch a pet, or use the bathroom. Then, if you touch your eyes, nose, or mouth, the germs can get inside you.

Washing your hands helps a lot. Use clean water and soap. Rub the soap all over your hands, between your fingers, and on your thumbs. Keep rubbing while you sing the Happy Birthday song two times. Then rinse the soap away and dry your hands with a clean towel.

Wash your hands before you eat. Wash them after you use the bathroom, after you play outside, and after you sneeze or cough.

When you cough or sneeze, cover your mouth and nose with a tissue or your elbow. That keeps germs from flying to your friends.` };

const L05: L = { n: 5, title: 'Sleep Helps My Body Grow', blurb: 'Why bedtime is a big job for your body and brain.', minutes: 4, body:
`When you sleep, you are not just resting. Your body is busy doing important work.

While you sleep, your body grows and fixes itself. Your brain sorts through what you learned that day, so you can remember it. Sleep also helps you feel happy and ready to play.

When you do not get enough sleep, you can feel grumpy, wiggly, or very tired. It can be hard to listen and learn.

Children your age need a lot of sleep, more than grown-ups do. Most young children need about ten to thirteen hours in a whole day, including naps for the littlest ones.

A bedtime routine helps your body know it is time to sleep. You might take a bath, brush your teeth, put on pajamas, read a story, and say goodnight. Try to go to bed at about the same time each night.

A dark, quiet room helps. Screens like TVs and tablets should be turned off before bed. If you feel scared at night, tell a grown-up. They can help you feel safe.` };

const L06: L = { n: 6, title: 'Food and Water', blurb: 'Fuel for growing, and why water is your best drink.', minutes: 4, body:
`Food is fuel for your body. It gives you energy to play, think, and grow. Different foods help your body in different ways.

Fruits and vegetables have vitamins that keep you healthy. Bread, rice, and pasta give you energy. Milk, cheese, and yogurt help build strong bones and teeth. Foods like beans, eggs, fish, and chicken help build strong muscles.

A good plate has many colors. Try to eat some fruit or vegetables at most meals. Treats like candy and cake are fine once in a while. They are not good as everyday food, because they do not give your body what it needs to grow.

Water is the best drink. Your body needs water to stay cool, to move, and to think well. When you play hard or the weather is hot, drink more water. If your mouth feels dry or you feel thirsty, that is your body asking for water.

It is okay to try new foods. Sometimes you need to taste a food many times before you like it. Eat when you are hungry and stop when you feel full.

Some people have allergies, which means certain foods make their bodies very sick. If you have an allergy, only eat food that a trusted grown-up says is safe.` };

const L07: L = { n: 7, title: 'Moving and Playing', blurb: 'Why running, jumping, and dancing make you strong.', minutes: 4, body:
`Moving your body is good for you, and it is fun too. When you run, jump, dance, climb, swim, or ride a bike, your body gets stronger.

Exercise makes your heart and lungs stronger. It makes your muscles and bones stronger too. It helps you sleep well at night. It can also help your mood. Many people feel happier after they have played outside.

You do not need special tools to be active. You can play tag, jump rope, kick a ball, play follow the leader, or have a dance party in the living room. Children your age should be active for a good part of every day.

Resting is important too. If you feel tired, dizzy, or sore, stop and rest. Drink some water. Tell a grown-up if something hurts.

Play safely. Wear a helmet when you ride a bike or scooter. Look around before you run. Play with a grown-up nearby when you are somewhere new, like a playground or a pool, and never go in the water without one.

Playing with friends is good for your heart in another way. Sharing and taking turns helps everyone feel included.` };

const L08: L = { n: 8, title: 'Feelings Are Okay', blurb: 'Happy, sad, mad, and scared: every feeling has a name.', minutes: 4, body:
`Everyone has feelings. You might feel happy, sad, mad, scared, excited, or silly. Feelings are not good or bad. They are just feelings, and they are part of being a person.

Your body can give you clues about your feelings. When you are scared, your heart might beat fast. When you are mad, your face might feel hot. When you are sad, your tummy or your throat might feel heavy. When you are excited, you might wiggle.

Giving a feeling a name helps. You can say, "I feel mad," or, "I feel nervous." Naming a feeling helps it feel smaller.

Feelings do not last forever. A big feeling will come and then it will get smaller, like a wave on the beach.

It is okay to feel a feeling. What we choose to do with the feeling matters. It is okay to be mad, but it is not okay to hit. We can use words, ask for space, or find another way to let the feeling out.

Your feelings are important. When you have a big one, you can tell someone you trust.` };

const L09: L = { n: 9, title: 'Calming Down and Talking About Feelings', blurb: 'Tools to use when a feeling gets very big.', minutes: 4, body:
`Sometimes a feeling gets very big, and it is hard to feel calm. Luckily, there are things you can try.

Take a deep breath. Breathe in slowly through your nose, like you are smelling a flower. Then breathe out slowly through your mouth, like you are blowing out a candle. Do it three times.

You can squeeze your hands tight and then let them go loose. You can hug a stuffed animal. You can count to ten. You can go to a quiet spot, drink some water, or draw a picture of how you feel.

Talking is one of the best tools. You can tell a grown-up you trust, like a parent, a teacher, or a school nurse. You might say, "I feel sad and I do not know why," or, "Something is bothering me." You do not have to have the perfect words. You can also say, "I need help."

Good listeners will not laugh at your feelings. They will listen and help you.

If you ever feel sad or worried for many days, or something scary is going on, it is very important to tell a grown-up. Asking for help is brave and smart.` };

const L10: L = { n: 10, title: 'Doctors, Nurses, and Dentists Are Helpers', blurb: 'The people whose job is to help keep you healthy.', minutes: 4, body:
`Some people have jobs that help keep us healthy. They are community helpers, and they like helping children.

A doctor checks how your body is growing and works to find out why you feel sick. A doctor can help you get better. A nurse helps doctors and also takes care of patients directly. A nurse might measure how tall you are, check your temperature, or give a shot to keep you healthy.

A dentist takes care of your teeth. A dental hygienist cleans your teeth and shows you how to brush well. Dentists look for places where food might be hurting your teeth, and they help fix them.

Other helpers include eye doctors who check your eyes, and pharmacists who give out medicine to grown-ups. Firefighters, paramedics, and emergency workers help in emergencies.

You can help your teeth by brushing twice a day, in the morning and before bed, with a small dab of toothpaste. Brush every side of every tooth. Eating less sugary food and drinks helps your teeth too.

If you are ever hurt or sick, helpers are ready to help you. They are on your side.` };

const L11: L = { n: 11, title: 'Going to the Doctor Without Fear', blurb: 'What happens at a check-up, and what you can do if you feel nervous.', minutes: 5, body:
`A check-up is a visit to the doctor when you are well. It helps make sure your body is growing the way it should.

Here is what might happen. A nurse may ask you to stand on a scale to see your weight, and against a wall to see how tall you are. The doctor may look in your ears, eyes, and mouth. They may listen to your heart and lungs with a stethoscope, which is a tool that helps them hear inside your chest. They may gently press on your tummy. They will ask you questions, and you can ask questions too.

Sometimes you get a shot. A shot is a quick pinch that helps your body get ready to fight certain germs. It can feel like a pinch for a moment, and then it is over. It is okay to feel nervous.

Here are ways to feel brave. Bring a favorite toy or book. Take slow, deep breaths. Look away and think about something fun. Hold a grown-up's hand. Ask the doctor to tell you what will happen before it happens.

A doctor visit is also a good time to ask about anything that worries you. The doctor wants to help.

Doctors and nurses never make a visit to be mean. It is their job to help you grow healthy.` };

const L12: L = { n: 12, title: 'My Body Belongs to Me', blurb: 'Body safety, safe and unsafe touches, and telling a trusted grown-up.', minutes: 5, body:
`Your body belongs to you. You get to decide who hugs you, who gets close, and who touches you. You can say no even to a person you know.

Some touches are safe, like a hug from a family member that you want, or a doctor checking you while a parent is there. Some touches are not okay. It is not okay for anyone to touch the private parts of your body, the parts covered by a bathing suit, except to keep you clean or healthy, like a parent or doctor helping when you need it. It is also not okay for anyone to ask you to touch their private parts, or to show you pictures of private parts.

No one should ask you to keep a secret about touching. Surprises, like a birthday gift, are fun and are told in the end. But secrets that make you feel worried, scared, or confused should be told.

If anything makes you feel uncomfortable, you can say, "Stop! I do not like that," and walk away. Then tell a trusted grown-up right away.

Think about who your trusted grown-ups are. They could be a parent, grandparent, teacher, or school nurse. If the first person does not listen, tell another until someone helps.

It is never your fault. You will never be in trouble for telling.` };

const L13: L = { n: 13, title: 'Medicine Safety', blurb: 'Why only a grown-up gives you medicine.', minutes: 4, body:
`Medicine can help people get better. But medicine is very strong. Too much, or the wrong kind, can make a person very sick. That is why medicine has rules.

Rule one: only a trusted grown-up gives you medicine. That may be a parent, a caregiver, or a school nurse. Never take medicine on your own, even if you feel sick.

Rule two: never take medicine that belongs to someone else. Medicine that helps your grandma may hurt you.

Rule three: medicine is not candy. Some medicine looks and tastes like candy, but it is not. Never eat or drink anything just because it looks yummy.

Rule four: if you find pills or medicine on the floor or in a bag, do not touch them. Get a grown-up right away.

Medicine and cleaning products should be kept up high or locked away, where small children cannot reach them. Many things around the house can be harmful if swallowed, such as cleaning sprays and laundry pods.

If you think you or a friend swallowed something that is not food, tell a grown-up right away. Grown-ups can call Poison Control or the emergency number to get help fast. Telling quickly is the right thing to do.` };

const L14: L = { n: 14, title: 'Staying Safe from Sun and Strangers', blurb: 'Sunscreen, shade, and what to do if someone you do not know approaches.', minutes: 5, body:
`The sun gives us light and warmth, and it is good to play outside. But the sun's rays can hurt our skin and eyes. Too much sun can give you a sunburn, which is red, sore skin.

To stay safe in the sun, wear sunscreen that a grown-up helps you put on. Wear a hat and sunglasses. Play in the shade when the sun is strongest, usually in the middle of the day. Drink plenty of water, and go inside if you feel dizzy or very hot. Never stay in a hot car.

Now let us talk about people you do not know. Most people are kind, but you should still be careful. A stranger is a person you do not know well.

If a stranger offers you a ride, candy, or a puppy, or asks you to come with them, say no. Do not go with them, and do not keep it secret. A grown-up who is safe will ask other grown-ups for help, not children.

Stay with your trusted grown-up in stores and parks. Know your full name and a phone number or address of someone you trust.

If you feel unsafe or lost, find a helper, like a police officer, a store worker with a name tag, or a parent with children. Tell them you need help.` };

const LESSONS: L[] = [L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14];

const Q: Question[] = [
  // 1
  mcq(lid(1), 1, 1, 'What is the job of your brain?', ['It helps you think and tells your body what to do', 'It pumps blood to the rest of your body', 'It breaks down the food that you eat', 'It lets you breathe air in and out'], 0, 'Think of the boss of your body.', 'The brain helps you think, remember, and tell your body what to do. The heart pumps blood, which is a different job.'),
  mcq(lid(1), 2, 1, 'Which body part helps you walk, run, and jump?', ['Your legs and feet', 'Your eyes and your ears', 'Your mouth and your nose', 'Your hands and your arms'], 0, 'Think about what you use at the playground.', 'Legs and feet help us move around. Hands and arms help with holding and waving.'),
  mcq(lid(1), 3, 1, 'What do your lungs help you do?', ['Breathe in air', 'Taste a snack', 'Hear music', 'Bend your knees'], 0, 'Breathe in, breathe out.', 'Lungs fill with air when you breathe in. Taste, hearing, and bending use other body parts.'),
  mcq(lid(1), 4, 2, 'A friend uses a wheelchair to get around. What is true about bodies?', ['All bodies are special and different, and deserve care', 'Only some bodies are good bodies that work well', 'Bodies must look the same to be healthy and strong', 'Bodies that are different cannot play or learn here'], 0, 'Think about being kind.', 'Every body is a little different, and each one is special. Having a different body does not make anyone less able to belong.'),
  // 2
  mcq(lid(2), 1, 1, 'Which sense do you use with your ears?', ['Hearing', 'Seeing', 'Smelling', 'Tasting'], 0, 'Music and a dog barking.', 'Ears are for hearing. Eyes are for seeing.'),
  mcq(lid(2), 2, 1, 'How many senses do you have?', ['Five', 'Two', 'Eight', 'Ten'], 0, 'Count see, hear, smell, taste, touch.', 'We usually learn five senses: seeing, hearing, smelling, tasting, and touching.'),
  mcq(lid(2), 3, 2, 'You touch a very hot cup and quickly pull your hand back. Which sense helped keep you safe?', ['Touch, with your skin', 'Taste, with your tongue', 'Smell, with your nose', 'Hearing, with your ears'], 0, 'Your hand felt it.', 'Your skin feels hot and cold and sends a message to your brain. Taste and smell do not help with a hot cup you touch.'),
  mcq(lid(2), 4, 2, 'You smell smoke in your home. What should you do?', ['Tell a grown-up right away', 'Keep playing until it goes away', 'Look for the smoke by yourself', 'Wait to see if it gets stronger'], 0, 'Smoke can be a warning.', 'Smells can warn us of danger. Telling a grown-up quickly keeps everyone safe, and waiting or searching alone is not safe.'),
  // 3
  mcq(lid(3), 1, 1, 'What does your heart do?', ['Pumps blood around your body', 'Helps you smell flowers', 'Holds your body up straight', 'Keeps your skin warm and dry'], 0, 'You can feel it beat in your chest.', 'The heart squeezes to push blood all around your body. Bones, not the heart, hold you up.'),
  mcq(lid(3), 2, 1, 'What keeps your brain safe, like a helmet?', ['Your skull', 'Your lungs', 'Your stomach', 'Your muscles'], 0, 'It is a hard bone in your head.', 'The skull is the bony case around the brain. Lungs and stomach are in the chest and belly.'),
  mcq(lid(3), 3, 2, 'After you run fast, your heart beats faster. Why might that be?', ['Your body wants more blood and air to keep going', 'Your heart is broken and needs to stop beating', 'Your brain has gone to sleep for a little while', 'Your lungs are turning into balloons to fly away'], 0, 'Think of what hard-working muscles need.', 'When you move hard, your muscles need more oxygen, so the heart pumps faster. A fast heartbeat after running is normal.'),
  mcq(lid(3), 4, 2, 'Which is a good way to protect your head?', ['Wear a helmet when you ride a bike', 'Ride a bike without any gear on at all', 'Wear a helmet only on rainy, wet days', 'Skip the helmet when you ride very slowly'], 0, 'Your brain needs protection.', 'A helmet helps protect your head and brain in a fall every time you ride, not just sometimes.'),
  // 4
  mcq(lid(4), 1, 1, 'What do you need to wash your hands well?', ['Clean water and soap', 'Only a quick wipe on your shirt', 'Warm air from a blow dryer alone', 'A dry paper towel with nothing else'], 0, 'Bubbles help push germs away.', 'Soap and water together help wash germs off. Wiping on clothes does not clean your hands.'),
  mcq(lid(4), 2, 1, 'How long should you rub your hands with soap?', ['About as long as singing Happy Birthday twice', 'Just one very quick second under the water', 'Until your hands are completely dry and warm', 'Only until you can see the bubbles appear'], 0, 'It is a song.', 'Rubbing for about twenty seconds, like singing Happy Birthday two times, gives soap time to work.'),
  mcq(lid(4), 3, 2, 'When is it a good time to wash your hands?', ['Before you eat and after you use the bathroom', 'Only when your hands look very, very dirty', 'Once in the morning and then not again', 'Just on days when you are feeling sick'], 0, 'Germs cannot be seen.', 'Germs are too small to see, so wash at key times such as before eating and after the bathroom, even when hands look clean.'),
  mcq(lid(4), 4, 2, 'You need to sneeze and have no tissue. What is a good thing to do?', ['Sneeze into your elbow', 'Sneeze into your bare hands', 'Sneeze straight at your friends', 'Hold your breath and hope it stops'], 0, 'Catch the germs where they will not spread.', 'Sneezing into your elbow keeps germs off your hands and away from other people. Sneezing into bare hands spreads germs to what you touch.'),
  // 5
  mcq(lid(5), 1, 1, 'What does sleep do for your body?', ['Helps it grow and fix itself', 'Makes you smaller than before', 'Stops your heart for the night', 'Takes away all of your feelings'], 0, 'Your body is busy at night.', 'During sleep the body grows and repairs itself, and the brain sorts what you learned.'),
  mcq(lid(5), 2, 1, 'Which is part of a good bedtime routine?', ['Brushing teeth and reading a story', 'Watching a loud show on a tablet', 'Running around until you are dizzy', 'Eating a big plate of candy'], 0, 'Think calm and quiet.', 'Calm steps like brushing teeth and reading help the body get ready for sleep. Loud screens and candy make sleeping harder.'),
  mcq(lid(5), 3, 2, 'You feel grumpy and cannot listen well after a night of very little sleep. Why?', ['Your body and brain did not get enough rest', 'Your bed was too big for you to use', 'Your teeth were too clean for sleeping', 'Your pajamas were the wrong color on you'], 0, 'Tired kids feel tired.', 'Not enough sleep can make a person grumpy and make it hard to listen and learn.'),
  mcq(lid(5), 4, 2, 'You feel scared in the dark at bedtime. What can you do?', ['Tell a grown-up so they can help you feel safe', 'Stay quiet and not tell anybody at all', 'Get up and wander around outside alone', 'Pretend that you are not scared and stay up'], 0, 'Trusted grown-ups can help.', 'Telling a grown-up helps you feel safe. Hiding feelings or wandering alone does not help.'),
  // 6
  mcq(lid(6), 1, 1, 'What is the best drink for your body?', ['Water', 'Soda pop', 'Fruit-flavored candy drink', 'Sweet syrup'], 0, 'It has no sugar in it.', 'Water helps your body stay cool, move, and think well without added sugar.'),
  mcq(lid(6), 2, 1, 'Which food helps build strong bones and teeth?', ['Milk, cheese, and yogurt', 'Cotton candy and gumdrops', 'Plain frosting and sprinkles', 'Marshmallows and lollipops'], 0, 'Think about the dairy group.', 'Dairy foods have calcium that helps bones and teeth grow strong. Candy does not.'),
  mcq(lid(6), 3, 2, 'It is a hot day and you have been running. What should you do?', ['Drink water', 'Skip all drinks', 'Eat a salty snack only', 'Stay in the sun and rest'], 0, 'Your body loses water when it sweats.', 'You sweat when it is hot, so you need to drink water to replace it.'),
  mcq(lid(6), 4, 2, 'A friend has a food allergy. What is the right thing to do?', ['Only share food that a trusted grown-up says is safe', 'Give a small bite to see if it bothers them', 'Trade snacks without asking anyone first', 'Tell them that a tiny bit will not matter'], 0, 'An allergy can be serious.', 'For people with allergies, even a small amount of a food can make them very sick, so a grown-up should check what is safe.'),
  // 7
  mcq(lid(7), 1, 1, 'What can moving and playing do for your body?', ['Make your heart and muscles stronger', 'Make your bones disappear', 'Take away your need for sleep', 'Stop you from growing taller'], 0, 'Exercise is good for you.', 'Exercise strengthens the heart, lungs, muscles, and bones. It does not remove your need for sleep.'),
  mcq(lid(7), 2, 1, 'What should you wear when riding a bike or scooter?', ['A helmet', 'A scarf', 'A heavy coat', 'Slippers'], 0, 'It protects the top of your body.', 'A helmet protects your head. The other items do not protect you in a fall.'),
  mcq(lid(7), 3, 2, 'You feel dizzy while running at recess. What is the best choice?', ['Stop, rest, drink water, and tell a grown-up', 'Run faster so that the dizzy feeling goes away', 'Keep playing hard and tell nobody anything', 'Spin around and around until you feel better'], 0, 'Listen to your body.', 'Dizziness is a sign to stop and rest. Telling a grown-up is a good idea.'),
  mcq(lid(7), 4, 2, 'Which of these counts as moving your body?', ['Dancing in your living room', 'Watching a long show on the couch', 'Lying still and quiet in your bed', 'Sitting still while you eat a meal'], 0, 'You use your muscles to do it.', 'Dancing uses your muscles and gets your heart pumping. The other choices are mostly sitting or lying still.'),
  // 8
  mcq(lid(8), 1, 1, 'Which of these is a feeling?', ['Sad', 'Shoe', 'Table', 'Window'], 0, 'Feelings are inside you.', 'Sad is a feeling. Shoes, tables, and windows are things.'),
  mcq(lid(8), 2, 1, 'What can happen in your body when you are scared?', ['Your heart might beat fast', 'Your hair might change colors', 'Your feet might get bigger', 'Your teeth might fall out'], 0, 'Feelings show up in the body.', 'When you are scared, your heart can beat faster. This is a normal body reaction.'),
  mcq(lid(8), 3, 2, 'You feel mad because a friend took your toy. What is a good choice?', ['Use words to say how you feel', 'Hit your friend to get it back', 'Throw the toy across the room', 'Never speak to your friend again'], 0, 'All feelings are okay, but not all actions are.', 'It is okay to feel mad. Using words is a safe way to show it, while hitting hurts people.'),
  mcq(lid(8), 4, 2, 'Why does it help to name a feeling, like saying "I feel nervous"?', ['It helps the feeling seem smaller and easier to share', 'It makes the feeling stay forever and ever', 'It means that you are in trouble with others', 'It makes other people feel the same way too'], 0, 'Words give you power.', 'Naming a feeling helps you understand it and tell others. It does not make the feeling last longer.'),
  // 9
  mcq(lid(9), 1, 1, 'What is one way to calm down when a feeling is big?', ['Take slow, deep breaths', 'Hold your breath for a long, long time', 'Yell until you feel tired out', 'Hide so no one ever sees you'], 0, 'Smell the flower, blow the candle.', 'Slow deep breaths help the body calm down. Holding your breath or yelling does not.'),
  mcq(lid(9), 2, 1, 'Who can you talk to about your feelings?', ['A trusted grown-up, like a parent or teacher', 'Only people you have never met before', 'Nobody, because feelings should be hidden', 'Someone who laughs at you when you cry'], 0, 'Think of someone who listens.', 'A trusted grown-up who listens is a good person to talk to. Hiding feelings can make them heavier.'),
  mcq(lid(9), 3, 2, 'You have felt sad and worried for many days. What is the best next step?', ['Tell a trusted grown-up so they can help', 'Wait quietly and hope it goes away alone', 'Pretend that you are fine every single day', 'Tell yourself that you are just being silly'], 0, 'Asking for help is brave.', 'When a feeling lasts many days, a grown-up can help. Keeping it secret makes it harder to get help.'),
  mcq(lid(9), 4, 2, 'You do not know the right words for how you feel. What can you say?', ['"Something is bothering me and I need help."', '"Nothing is wrong, so I will not say more."', '"I am not allowed to tell anyone anything."', '"It is a secret that nobody should hear."'], 0, 'You do not need perfect words.', 'You can say that something is bothering you and ask for help. Good listeners will understand.'),
  // 10
  mcq(lid(10), 1, 1, 'What does a dentist take care of?', ['Your teeth', 'Your toes', 'Your elbows', 'Your hair'], 0, 'Think about your smile.', 'A dentist takes care of teeth and gums.'),
  mcq(lid(10), 2, 1, 'How often should you brush your teeth?', ['Twice a day, morning and before bed', 'Only once each week on a weekend', 'Only after eating a sweet snack', 'Never, because teeth clean themselves'], 0, 'Start and end the day.', 'Brushing in the morning and before bed helps keep teeth healthy.'),
  mcq(lid(10), 3, 2, 'Which helper checks how your body is growing and can help you feel better when you are sick?', ['A doctor', 'A bus driver', 'A baker', 'A mail carrier'], 0, 'They work in a clinic or hospital.', 'Doctors check how children grow and help them get better. The other workers help the community in other ways.'),
  mcq(lid(10), 4, 2, 'Why are doctors, nurses, and dentists called helpers?', ['Their jobs are to help keep people healthy', 'Their jobs are to make children feel scared', 'Their jobs are to give out candy to patients', 'Their jobs are to tell people what to wear'], 0, 'Think about why they do the job.', 'Health workers help people stay healthy and get well. They are on your side.'),
  // 11
  mcq(lid(11), 1, 1, 'What do we call a check-up visit to the doctor?', ['A visit to the doctor when you are well, to make sure you are growing', 'A visit to the doctor only when you are very sick at home', 'A trip where a person tests your spelling for school', 'A test where you must sit still for an entire hour'], 0, 'You do not have to be sick.', 'A check-up is a visit to see how your body is growing, even when you feel fine.'),
  mcq(lid(11), 2, 1, 'What is a stethoscope used for?', ['Listening to your heart and lungs', 'Cleaning plaque off your teeth', 'Measuring how tall you are growing', 'Looking closely into your eyes'], 0, 'Doctors put it on your chest.', 'A stethoscope helps a doctor hear your heart and lungs.'),
  mcq(lid(11), 3, 2, 'You feel nervous about getting a shot. What might help?', ['Take slow breaths and look away at something fun', 'Run out of the room and hide somewhere', 'Pretend that you do not know anything', 'Tell yourself that nothing ever hurts'], 0, 'Try a brave trick.', 'Breathing slowly and focusing on something else can make a shot easier. It is okay to feel nervous.'),
  mcq(lid(11), 4, 2, 'Why is it good to ask the doctor questions?', ['It helps you understand what is happening and not feel scared', 'It makes the visit last as long as possible all day', 'It means you do not have to see the doctor again', 'It helps the doctor skip your check-up completely'], 0, 'Knowing helps.', 'Asking questions helps you know what to expect, which makes visits less scary.'),
  // 12
  mcq(lid(12), 1, 1, 'Who decides who can touch your body?', ['You do', 'Only your friends', 'Only strangers', 'Nobody does'], 0, 'Your body belongs to you.', 'You have the right to say who touches you. You can say no.'),
  mcq(lid(12), 2, 1, 'If something makes you feel uncomfortable, what should you do?', ['Say stop, go away, and tell a trusted grown-up', 'Keep it a secret so you do not get in trouble', 'Wait until it happens one more time to be sure', 'Decide that it is your own fault and stay quiet'], 0, 'Speak up and then tell.', 'You can say stop, move away, and tell a trusted grown-up. It is never your fault.'),
  mcq(lid(12), 3, 2, 'A person asks you to keep a secret about touching your private parts. What is right?', ['Tell a trusted grown-up, even if the person said not to', 'Keep the secret to make the person happy', 'Wait a year to see if the person asks again', 'Only tell someone if you are completely sure'], 0, 'Some secrets should always be told.', 'Secrets about touching are not okay. Tell a trusted grown-up. You will not be in trouble for telling.'),
  mcq(lid(12), 4, 2, 'You told a grown-up about something scary, but they did not listen. What next?', ['Tell another trusted grown-up until someone helps', 'Decide that nobody can ever help you at all', 'Never speak about it again for the rest of your life', 'Believe that you were wrong to tell anyone about it'], 0, 'Keep asking.', 'If one person does not help, keep telling other trusted grown-ups. You deserve help.'),
  // 13
  mcq(lid(13), 1, 1, 'Who should give you medicine?', ['A trusted grown-up', 'You, on your own', 'A friend at school', 'A younger child'], 0, 'Medicine has rules.', 'Only a trusted grown-up, such as a parent or school nurse, should give medicine to a child.'),
  mcq(lid(13), 2, 1, 'Is medicine the same thing as candy?', ['No, even if it looks or tastes like candy', 'Yes, if it is a nice color', 'Yes, if there is some left in the bottle', 'Yes, as long as you only eat one'], 0, 'It can be harmful.', 'Medicine is not candy. Too much can make you very sick, even if it looks yummy.'),
  mcq(lid(13), 3, 2, 'You find a pill on the floor at a friend\'s house. What should you do?', ['Do not touch it, and tell a grown-up right away', 'Pick it up and put it in your pocket to keep', 'Taste it to see what kind of pill it might be', 'Give it to your friend to try first as a test'], 0, 'Unknown medicine is unsafe.', 'Never touch or taste unknown pills. A grown-up can handle it safely.'),
  mcq(lid(13), 4, 2, 'Your sibling feels sick and you have your grandma\'s medicine. What is the best choice?', ['Tell a grown-up and do not give the medicine yourself', 'Give your sibling some from the bottle at once', 'Share a bit because it helped Grandma feel better', 'Mix some into a drink so it tastes better'], 0, 'Medicine for one person can harm another.', 'Medicine that helps one person may hurt someone else. Only a grown-up should decide about medicine.'),
  // 14
  mcq(lid(14), 1, 1, 'How can you protect your skin from the sun?', ['Wear sunscreen, a hat, and play in the shade', 'Stay outside in the middle of the day with nothing on', 'Only use sunscreen on days that are cloudy and cold', 'Rub on lots of water and nothing else'], 0, 'Cover up and cool down.', 'Sunscreen, hats, sunglasses, and shade all help protect skin and eyes from the sun.'),
  mcq(lid(14), 2, 1, 'What do we mean when we say stranger?', ['A person you do not know well', 'A person who is your best friend', 'A person in your own family', 'A person who is your teacher'], 0, 'You have not met them before.', 'A stranger is someone you do not know well. Most are kind, but you should still be careful.'),
  mcq(lid(14), 3, 2, 'A stranger offers you candy and asks you to come to their car. What do you do?', ['Say no, go away, and tell a trusted grown-up', 'Go along since the candy is so very nice', 'Ask them to meet you at home for the candy', 'Say yes if the stranger seems very friendly'], 0, 'No, go, tell.', 'Never go with a stranger. Say no, move away quickly, and tell a trusted grown-up.'),
  mcq(lid(14), 4, 2, 'You get lost in a store. Who is a good person to ask for help?', ['A worker with a name tag or a police officer', 'Anyone who offers to take you outside', 'Nobody, because you should wait alone', 'A person who asks you to follow them home'], 0, 'Look for someone whose job is to help.', 'Store workers with name tags and police officers are safe helpers. Never go outside with someone you do not know.'),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: ID,
    label: 'My Body and Staying Healthy',
    blurb: 'A gentle first look at your body, your senses and feelings, healthy habits, and how to stay safe with the help of trusted grown-ups.',
    accent: '#E5484D',
    framework: 'plajah-medicine',
    tracks: [
      { id: `${ID}.t1`, title: 'My Amazing Body', blurb: 'Body parts, senses, and the helpers inside you.', level: 'FOUNDATION', lessons: [L01, L02, L03].map(lesson) },
      { id: `${ID}.t2`, title: 'Healthy Habits', blurb: 'Germs, sleep, food, water, and moving.', level: 'FOUNDATION', lessons: [L04, L05, L06, L07].map(lesson) },
      { id: `${ID}.t3`, title: 'Feelings and Helpers', blurb: 'Feelings, calming down, and the people who help keep you healthy.', level: 'FOUNDATION', lessons: [L08, L09, L10, L11].map(lesson) },
      { id: `${ID}.t4`, title: 'Staying Safe', blurb: 'Body safety, medicine safety, sun, and strangers.', level: 'FOUNDATION', lessons: [L12, L13, L14].map(lesson) },
    ],
  },
  bank: { curriculumId: ID, questions: Q },
};

void LESSONS;
