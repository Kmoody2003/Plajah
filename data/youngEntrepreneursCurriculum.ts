/**
 * youngEntrepreneursCurriculum — "Young Entrepreneurs", money and enterprise from preschool up,
 * taught through math. Rides the shared School chassis (services/schoolChassis.ts).
 *
 * Four age bands. The first three build the habits and the arithmetic (coins, price, cost, profit,
 * percent, break-even); the 9-12 Venture track hands off to Praxis, where the learner runs the
 * spark → validate → form → books → operate → fund → grow journey with real numbers.
 *
 * Guardrail: this is education, not legal, tax or investment advice. Rules vary by place, so
 * lessons stay general and point learners to a trusted adult or professional.
 */
import type { Curriculum } from '../services/schoolChassis';

export const YOUNG_ENTREPRENEURS: Curriculum = {
  id: 'young-entrepreneurs',
  label: 'Young Entrepreneurs',
  blurb:
    'Money and enterprise from the first coin to a first venture. Count it, price it, sell it, save it, and learn the math that makes a small business work, including the music and film businesses Plajah creators love.',
  accent: '#F59E0B',
  framework: 'CEE_FINLIT',
  tracks: [
    // ── PreK-2 ──────────────────────────────────────────────────────────────────
    {
      id: 'ye-k2',
      title: 'PreK-2 Little Shop',
      blurb: 'Counting coins, needs and wants, trading, running a pretend shop, and saving for something special.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ye-k2-1',
          title: 'Counting Coins',
          blurb: 'Pennies, nickels, dimes and quarters, and how to count them up.',
          minutes: 10,
          standardIds: ['CEE.ECON.1.4', 'PFL.EARN.4'],
          body: `Money comes in coins and paper. Today we meet four coins, and each one has a number of cents, which is how we say how much it is worth.

A penny is worth 1 cent. A nickel is worth 5 cents. A dime is worth 10 cents. A quarter is worth 25 cents. Notice something funny: the dime is smaller than the nickel, but it is worth more. With coins, size does not tell you the worth. The number does.

To count coins, start with the biggest worth and count up. Say you have 1 quarter, 1 dime and 1 nickel. Start with the quarter: 25. Add the dime and count by tens: 35. Add the nickel and count by fives: 40. So you have 40 cents.

Here is a second one. You have 2 dimes and 1 nickel. Count by tens first: 10, 20. Then add the nickel: 25. Two dimes and a nickel make 25 cents, the same as one quarter. Different coins can make the same amount, and that is the secret that makes shopkeepers good at their jobs.

Counting by fives and tens is called skip counting. It is faster than counting by ones, and it is the very first piece of business math. A shopkeeper who can skip count can give the right change.

Try it with a pretend shop. Put a price tag of 20 cents on a toy. Ask a friend to pay with coins. How many different ways can they make 20 cents? Two dimes. Four nickels. One dime and two nickels. Every way is right, because every way adds up to the same number.`,
          assignment: {
            prompt: `Make a coin card. Draw or stick on one of each coin and write how many cents it is worth. Then show a grown-up three different ways to make 20 cents.`,
            tool: 'NONE',
            postTag: 'ye-coins',
          },
        },
        {
          id: 'ye-k2-2',
          title: 'Needs and Wants',
          blurb: 'Some things we must have, and some things we would like. Money helps us choose.',
          minutes: 10,
          standardIds: ['D2.Eco.1.K-2', 'PFL.SPEND.4'],
          body: `A need is something you must have to be healthy and safe. Food, water, a warm coat in winter, a home to sleep in. Without these, we cannot do well.

A want is something nice to have, but you can live without it. A toy robot, a candy bar, a new game, a sparkly sticker. Wants are not bad. Wanting things is part of being a person. The important part is to notice which is which.

Why does it matter? Because money is limited. Nobody has enough money to buy everything. So we have to choose, and that is the big idea in all of money: when you pick one thing, you give up something else.

Let us try an example with counting. Mia has 3 coins. A pencil for school costs 1 coin. A sticker costs 1 coin. A toy car costs 2 coins. If Mia buys the pencil and the sticker, she spends 2 coins and has 1 coin left. If she buys the toy car, she spends 2 coins and has 1 left, but no pencil. Mia needs the pencil for school, so she buys the pencil first. Then she looks at what is left and decides about the wants.

A shop sells both needs and wants. A grocery store sells mostly needs, like bread and milk. A toy store sells mostly wants. A band that sells T-shirts is selling a want, because people do not need a shirt, they love the music. A good shopkeeper knows which things people need and which they love.

When you choose, ask two questions: Do I need it? Do I want it? Then count your coins.`,
          assignment: {
            prompt: `Fold a paper in half. On one side draw 3 needs, on the other side draw 3 wants. Then pick one want you would save for and tell a grown-up why.`,
            tool: 'NONE',
            postTag: 'ye-needs-wants',
          },
        },
        {
          id: 'ye-k2-3',
          title: 'Trading and Swapping',
          blurb: 'Before coins there was trading. See why money makes swapping easier.',
          minutes: 12,
          standardIds: ['D2.Eco.1.K-2', 'CEE.ECON.1.4'],
          body: `Long ago, people did not use coins. If you had extra apples and wanted a fish, you found someone with extra fish who wanted apples, and you traded. Trading things without using money is called bartering.

A trade is fair when both people are happy to do it. If one person is forced or tricked, it is not a fair trade.

Let us count a trade. Sam has stickers. A friend has cookies. They agree that 2 stickers buy 1 cookie. Sam wants 3 cookies. How many stickers does he need? 2 for the first cookie, 2 more for the second, 2 more for the third. Count by twos: 2, 4, 6. Sam needs 6 stickers.

Now think about a problem. Sam wants a cookie, but the friend with the cookies does not want stickers today. The friend wants a pencil. Now Sam has to find someone who wants stickers and has a pencil. That could take all day.

This is why people invented money. Money is something everyone agrees to accept. Sam sells his stickers for coins, and then uses the coins to buy a cookie from anyone. Money is like a trading helper.

You can see this in a band. A band might trade a poster for a free lunch at a diner. That works if the diner likes posters. But if the band sells posters for coins, they can buy lunch anywhere, and shoes, and guitar strings too.

Trading is still fun, and good for learning. It shows us that things have value because people want them.`,
          assignment: {
            prompt: `Hold a trade fair with family or classmates. Bring 3 small items and agree on fair swaps. Count how many things each person gives and gets, then say why money would make it easier.`,
            tool: 'NONE',
            postTag: 'ye-trade-fair',
          },
        },
        {
          id: 'ye-k2-4',
          title: 'Our Pretend Shop',
          blurb: 'Make something small, set a price, and sell it to customers.',
          minutes: 15,
          standardIds: ['PFL.EARN.4', 'CEE.ECON.1.4'],
          body: `A shop has two sides: the seller and the customer. The seller makes or finds something to sell and gives it a price. The customer pays the price and takes the thing home. Today you are the seller.

First, make something small. It could be a drawing, a paper bracelet, a button, or a cup of pretend lemonade. Make at least 4 so you have enough to sell.

Second, set a price. Keep it easy to count. Say each button costs 10 cents. Now look how counting helps. If you sell 1 button, you get 10 cents. Sell 2 buttons, skip count: 10, 20. Sell 3 buttons: 10, 20, 30. Sell 4 buttons: 10, 20, 30, 40. You have made 40 cents!

A sticker for 5 cents is the same, but you count by fives. Sell 4 stickers: 5, 10, 15, 20. That is 20 cents.

Third, make a sign so customers know the price. A good sign has a picture and a number. Sellers who put their sign where people can see it sell more.

Imagine a little band called The Sunbeams. They make 4 paper band buttons and sell each for 10 cents at their living room concert. Every time someone buys one, they say thank you and put the coins in a cup. At the end, they count the cup: skip count by tens and you find how many buttons they sold.

Being a good seller means being kind, saying thank you, and giving back the right coins when a customer pays with too much.`,
          assignment: {
            prompt: `Open a pretend shop. Make 4 things, put a price on each, make a sign, and sell them to family with play coins. At the end, skip count your coins and tell how much you made.`,
            tool: 'PIXELS',
            postTag: 'ye-pretend-shop',
          },
        },
        {
          id: 'ye-k2-5',
          title: 'Saving for Something Special',
          blurb: 'Put some coins away today so you can buy something bigger later.',
          minutes: 10,
          standardIds: ['PFL.SAVE.4', 'D2.Eco.1.K-2'],
          body: `Saving means keeping some of your money for later instead of spending it all right now. When you save, you can afford something bigger that you could not buy with just a few coins.

Picture a toy that costs 25 cents. You only have 5 cents. You cannot buy it today. But you can make a plan. Every day you put 5 cents in a jar. Day one: 5. Day two: 10. Day three: 15. Day four: 20. Day five: 25. On day five you can buy the toy! Counting by fives showed you how long the plan takes.

What if you saved 5 cents a day for 4 days and have 20 cents, and the toy costs 25? You still need 5 more cents. Count up from 20 to 25: that is one nickel. A goal plus counting tells you exactly how much farther you have to go.

A saving goal is the thing you are saving for. Having a goal makes saving feel exciting, not boring. You can even draw a picture of your goal and color in a box for every nickel you save.

Where do you keep your savings? A piggy bank, a jar at home, or a bank account with a grown-up. A bank is a safe place that keeps money for people.

Musicians do this too. A band that wants a new drum set does not buy it the first day. They save a little from each show until they have enough.

A good rule is to split money into three jars: spend, save, and share. Each time you get coins, put some in each jar.`,
          assignment: {
            prompt: `Pick a saving goal and draw it. Make a coloring chart with one box per nickel you need. Color a box each time you save, and tell a grown-up how many are left.`,
            tool: 'NONE',
            postTag: 'ye-saving-goal',
          },
        },
      ],
    },

    // ── 3-5 ─────────────────────────────────────────────────────────────────────
    {
      id: 'ye-35',
      title: '3-5 Market Day',
      blurb: 'Pricing, cost and profit, running a class store, simple budgets, and listening to customers.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ye-35-1',
          title: 'What Should It Cost?',
          blurb: 'Set a price that covers what it cost you to make and leaves something over.',
          minutes: 15,
          standardIds: ['PFL.EARN.4', 'PFL.SPEND.4'],
          body: `Every product has a story of money behind it. Before you pick a price, you need to know your cost: the money you spent to make one item. A friendship bracelet needs string and beads. If the string and beads cost you 2 dollars for one bracelet, your cost is 2 dollars.

Your price is what the customer pays. For a business to work, the price must be higher than the cost. The difference is your profit.

profit per item = price - cost

Suppose you price the bracelet at 5 dollars. Your profit on each bracelet is 5 - 2 = 3 dollars. Sell 6 bracelets and you earn 6 x 3 = 18 dollars in profit. That is the money you get to keep after paying for the supplies.

Now see what happens with a price that is too low. If you charge 1.50 dollars, you lose 50 cents on every bracelet, because 1.50 - 2 = -0.50. The more you sell, the more you lose! A price below your cost is a quick way to run out of money.

How do you pick a good price? Think about three things.
1. First, what does it cost to make?
2. Second, what do similar things sell for?
3. Third, what would your customer happily pay?

A price a little above your cost, near what others charge, is a great start.

Prices can include fun math. Cookies at 1.50 dollars each: 10 cookies is 10 x 1.50 = 15 dollars. Two cookies is 3 dollars, so 10 cookies is 5 times that, which is 15 dollars. The same answer two ways.

A band selling stickers works the same way. If printing each sticker costs 40 cents and the band sells them for 1 dollar, each sale leaves 60 cents.`,
          assignment: {
            prompt: `Choose something you could make. List what one costs (materials), research two similar prices, and set your own price. Write the profit per item as a subtraction sentence.`,
            tool: 'NONE',
            postTag: 'ye-pricing',
          },
        },
        {
          id: 'ye-35-2',
          title: 'Revenue, Cost and Profit',
          blurb: 'Follow the money through a school film night.',
          minutes: 15,
          standardIds: ['PFL.EARN.4', 'CEE.ECON.1.4'],
          body: `Three words run every business. Revenue is all the money that comes in from sales. Costs are everything you spend to run the business. Profit is what is left after you pay the costs.

profit = revenue - costs

Let us run a school film night. Your class made a short film and wants to show it to families. You decide to sell tickets at 3 dollars each. 40 people buy a ticket. Revenue: 40 x 3 = 120 dollars.

But the night has costs. Popcorn and cups cost 35 dollars. Posters to tell people about the event cost 15 dollars. Total costs: 35 + 15 = 50 dollars.

Now find the profit: 120 - 50 = 70 dollars. The class could use the 70 dollars to buy art supplies or a better microphone for the next film.

What if fewer people came? Say only 15 tickets sold. Revenue is 15 x 3 = 45 dollars. Costs are still 50 dollars, because you already bought the popcorn and posters. Profit: 45 - 50 = -5 dollars. A negative profit is called a loss. You lost 5 dollars. Some costs stay the same no matter how many people come, so a business needs enough customers.

You can see the point where you stop losing: when revenue equals costs. With 3-dollar tickets and 50 dollars in costs, 17 tickets gives 51 dollars, just above costs. This is a first peek at something called break-even, which we will study later.

Always write down revenue, costs and profit in three lines. It keeps your thinking clear.`,
          assignment: {
            prompt: `Plan a film night, concert or show for family. Choose a ticket price and a number of guests, list your costs, then calculate revenue and profit. Try it again with half as many guests.`,
            tool: 'FABULA',
            postTag: 'ye-film-night',
          },
        },
        {
          id: 'ye-35-3',
          title: 'Open the Class Store',
          blurb: 'Buy supplies in bulk, find the cost of each, and sell at a profit.',
          minutes: 18,
          standardIds: ['PFL.EARN.4', 'PFL.SPEND.4', 'CEE.ECON.1.4'],
          body: `Many shops buy lots of items at once and sell them one at a time. The items waiting on the shelf are called inventory. Your class store needs inventory before it can open.

Say you buy 24 pencils for 12 dollars. What did each pencil cost you? Divide the total by the number of items: 12 / 24 = 0.50. Each pencil cost 50 cents. This is your cost per item.

Now set a price. If you sell each pencil for 1 dollar, you make 1 - 0.50 = 0.50 dollars profit per pencil. If you sell all 24, revenue is 24 x 1 = 24 dollars. You spent 12 dollars, so profit is 24 - 12 = 12 dollars.

But what if you only sell 18 pencils? Revenue is 18 x 1 = 18 dollars. Profit is 18 - 12 = 6 dollars. You still made money, and you have 24 - 18 = 6 pencils left in inventory to sell tomorrow.

Shopkeepers keep a simple tally: how many started, how many sold, how many left. Start 24, sold 18, left 6. That tally helps them know when to reorder.

Think about what to stock. A class store near a music room might sell guitar picks, small notebooks for lyrics and erasers. A store near the film club might sell sticky notes and pencils for storyboards. Good stores sell what their customers need.

Be careful with prices that are hard to count. A price of 1 dollar or 50 cents makes making change easy. If your price is 87 cents, you will need to subtract carefully every time someone pays.

Keep your cash box neat, and count it at the start and the end of the day.`,
          assignment: {
            prompt: `Run a class store for one recess or a pretend one at home. Choose 3 items, find the cost of each, set prices, and keep a tally of started, sold and left. Calculate your profit at the end.`,
            tool: 'NONE',
            postTag: 'ye-class-store',
          },
        },
        {
          id: 'ye-35-4',
          title: 'My First Budget',
          blurb: 'Plan where your money will go before you spend it.',
          minutes: 15,
          standardIds: ['PFL.SPEND.4', 'PFL.SAVE.4'],
          body: `A budget is a plan for how you will use the money you expect to get. It has two sides. Income is money coming in, like allowance or money you earn from selling. Spending is money going out.

Imagine you earn 20 dollars one month. You make a plan with three jars: save 5 dollars, spend 10 dollars, share 5 dollars. Add them up: 5 + 10 + 5 = 20. The plan uses every dollar, so nothing disappears by accident.

Now try a trickier one. Income is 30 dollars. You plan to spend 18 dollars on supplies and give 2 dollars to a school fundraiser. How much is left to save? First add what you planned: 18 + 2 = 20. Then subtract from income: 30 - 20 = 10. You can save 10 dollars.

Budgets also use fractions. Suppose a band earned 80 dollars from selling shirts and wants to spend one fourth of it on new posters. One fourth of 80 is 80 / 4 = 20 dollars. The band spends 20 dollars on posters, and the other 60 dollars goes to other plans.

A good budget has a few habits. Write down your income first. List needs before wants. Put some into savings first, even a little. And check your budget at the end of the week to see how it went. If you spent more than planned, that is useful information, not a failure. Adjust the plan next time.

Businesses have budgets too, and the best ones are written down so everyone in the team can see where the money goes.`,
          assignment: {
            prompt: `Make a one-month budget for real or pretend money. List your income, plan save, spend and share amounts, and check that the pieces add up to your income. Decorate it as a poster.`,
            tool: 'PIXELS',
            postTag: 'ye-budget',
          },
        },
        {
          id: 'ye-35-5',
          title: 'Listening to Customers',
          blurb: 'Ask, count the answers, and improve what you sell.',
          minutes: 15,
          standardIds: ['PFL.EARN.4', 'D2.Eco.1.K-2'],
          body: `The best sellers do something that sounds simple: they ask their customers. What customers tell you about what you sell is called feedback. Feedback helps you make things people truly want, so you do not waste money making the wrong thing.

A survey is a short set of questions you ask many people. Suppose you made a new cookie flavor and 20 classmates try it. You ask, Did you like it? 14 say yes and 6 say no. What fraction liked it? 14 out of 20, which is 14/20. You can simplify by dividing top and bottom by 2 to get 7/10. As a percent, 7/10 is 70 out of 100, so 70%.

Percent is just a fraction out of 100, and you can find it by thinking: 14 / 20 = 0.70, or 70%. If 70% of people like your cookie, that is strong, and you might feel good selling it.

Now try another. A band asks 30 classmates if they would buy a poster. 12 say yes. The fraction is 12/30. Divide top and bottom by 6: 2/5. That is 40%. Maybe they should make fewer posters, or change the design.

How to ask well: keep questions short, ask different kinds of people, and listen without arguing. If a customer says your lemonade is too sour, do not be upset. Try a little less lemon, ask again, and see if the numbers improve.

Write answers as tally marks, then count. Feedback plus counting is how good businesses improve.`,
          assignment: {
            prompt: `Write a 3-question survey about something you could sell. Ask at least 10 people, tally the answers, turn the main result into a fraction and a percent, and decide what to change.`,
            tool: 'NONE',
            postTag: 'ye-feedback',
          },
        },
      ],
    },

    // ── 6-8 ─────────────────────────────────────────────────────────────────────
    {
      id: 'ye-68',
      title: '6-8 Small Business',
      blurb: 'Unit economics, percent markup and discount, break-even, advertising, and a basic income statement.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ye-68-1',
          title: 'Unit Economics',
          blurb: 'Know exactly what you earn on one item before you make a hundred.',
          minutes: 18,
          standardIds: ['PFL.EARN.8', 'CEE.ECON.2.8'],
          body: `Before a business grows, it must be able to answer one question: do I make money on a single item? Studying the money made or lost on one unit is called unit economics.

Start with variable cost, the cost that shows up for every unit you make. For a bracelet: beads and string cost 1.20 dollars, and the little packaging bag costs 0.30 dollars. Variable cost per unit is 1.20 + 0.30 = 1.50 dollars.

Next, the price: say 4.00 dollars. The money each sale contributes toward your other bills and profit is called contribution per unit.

contribution per unit = price - variable cost per unit

Here that is 4.00 - 1.50 = 2.50 dollars. Sell 40 bracelets and you earn 40 x 2.50 = 100 dollars in total contribution. Notice how fast the math scales: if you know one unit, you know them all.

Now a creator example. A band sells T-shirts at 15 dollars. Each shirt costs 9 dollars to print and ship. Contribution is 15 - 9 = 6 dollars per shirt. If the band sells 50 shirts at a show, contribution is 50 x 6 = 300 dollars.

What if the unit math is bad? Suppose a sticker costs 1.10 dollars to make and ship but sells for 1.00 dollar. Contribution is -0.10. Selling more makes you lose more, so you must fix the price or the cost before you grow.

You can improve unit economics in only two ways: raise the price or lower the variable cost. Buying materials in bulk, designing a smaller package, or choosing a cheaper but still good supplier all lower cost. A slightly higher price, if customers still say yes, raises contribution immediately.`,
          assignment: {
            prompt: `Pick a product. List every variable cost for one unit, set a price, and compute contribution per unit. Then compute contribution for 25, 50 and 100 units in a small table.`,
            tool: 'PRAXIS',
            postTag: 'ye-unit-economics',
          },
        },
        {
          id: 'ye-68-2',
          title: 'Markup and Discount with Percent',
          blurb: 'Use percent to set prices and run sales without losing money.',
          minutes: 18,
          standardIds: ['PFL.SPEND.8', 'CEE.ECON.7.8'],
          body: `Percent is the language of pricing. Two ideas matter most: markup and discount.

Markup is how much you add on top of your cost, written as a percent of cost.

price = cost + (cost x markup)

Say a hat costs you 20 dollars and your markup is 50%. The markup amount is 20 x 0.50 = 10 dollars, so the price is 20 + 10 = 30 dollars.

You can also work backward. A band tee costs 8 dollars to make and is priced at 14 dollars. The difference is 14 - 8 = 6 dollars. Markup percent is that difference divided by the cost: 6 / 8 = 0.75, or 75%. Be careful: dividing by the price instead gives 6 / 14, about 43%, which is a different number called margin. Markup uses cost as the base.

Now a discount, which is a percent taken off the price. A 20% discount on the 14-dollar tee takes off 14 x 0.20 = 2.80 dollars, so the sale price is 14 - 2.80 = 11.20 dollars. Still above the 8-dollar cost, so you still earn 3.20 dollars on each tee.

A faster way: 20% off means customers pay 80% of the price, so 14 x 0.80 = 11.20. Same answer in one step.

Another check: a 40-dollar poster with a 25% discount. 25% of 40 is 10, so the sale price is 30 dollars. Or 40 x 0.75 = 30.

Discounts are not free. Before running a sale, check that the new price is still above your cost, and think about whether it will bring enough extra buyers to be worth it.`,
          assignment: {
            prompt: `Choose a product and its cost. Price it with a 40% markup and a 75% markup, then compute a 20% sale price for each. Say which sale prices still leave a profit and what you would choose.`,
            tool: 'NONE',
            postTag: 'ye-markup',
          },
        },
        {
          id: 'ye-68-3',
          title: 'Break-Even',
          blurb: 'Find how many sales cover your fixed costs, and where profit begins.',
          minutes: 20,
          standardIds: ['PFL.EARN.8', 'CEE.ECON.2.8'],
          body: `Some costs happen once, no matter how many you sell. These are fixed costs: renting a booth, buying a screen for printing shirts, paying for a website. Variable costs, as you learned, change with each unit.

The break-even point is the number of units where total revenue equals total cost, so profit is zero. Sell more and you profit. Sell fewer and you lose.

The formula uses contribution per unit:

break-even units = fixed costs / contribution per unit

Example: you spend 120 dollars on a printing setup for tees. Each tee has a contribution of 6 dollars. Break-even is 120 / 6 = 20 tees. The first 20 sales pay back the setup. Tee number 21 starts adding profit, 6 dollars at a time. If you sell 50, profit is (50 - 20) x 6 = 180 dollars.

Check it in another way. Revenue at 20 tees with a 15-dollar price is 300. Total cost is 120 fixed plus 20 x 9 variable = 120 + 180 = 300. Revenue equals cost.

Here is a film example. A school film night needs a hall that costs 200 dollars, and tickets are 5 dollars with no cost per ticket. Break-even is 200 / 5 = 40 tickets. If the hall seats 100, you know you need just 40 percent of the seats full to avoid a loss.

A common mistake is multiplying instead of dividing. 200 x 5 = 1,000 is not a sensible number of tickets for a hall of 100. Always ask if your answer makes sense.

Use break-even before you spend. If the number looks impossible, change the price, cut the fixed cost, or think again.`,
          assignment: {
            prompt: `Plan a product or event with a fixed cost and a unit price. Calculate break-even units, then check the answer by finding revenue and total cost at that number. Say whether you think you can reach it.`,
            tool: 'PRAXIS',
            postTag: 'ye-break-even',
          },
        },
        {
          id: 'ye-68-4',
          title: 'Advertising by the Numbers',
          blurb: 'Measure whether a poster, trailer or ad was worth what it cost.',
          minutes: 18,
          standardIds: ['PFL.SPEND.8', 'CEE.ECON.2.8'],
          body: `Advertising tells people your product exists. It also costs money, so a smart seller measures it. Three numbers do most of the work: reach, response rate and cost per customer.

Reach is how many people see the ad. Response rate is the percent of them who buy. Say you spend 50 dollars on a poster campaign that reaches 2,000 people, and 2% buy. 2% of 2,000 is 0.02 x 2,000 = 40 customers.

Cost per customer = ad cost / customers = 50 / 40 = 1.25 dollars. You paid 1.25 dollars to win each new customer.

Is that a good deal? Compare it with what each customer gives you. If each customer brings 5 dollars of contribution, the ads brought in 40 x 5 = 200 dollars. Subtract the 50-dollar ad cost and the net gain is 150 dollars. That ad was worth it.

Compare with another ad: you spend 60 dollars and get 30 customers. Cost per customer is 60 / 30 = 2 dollars. Still under 5, so still profitable, but the first ad was cheaper per customer.

Targeting means aiming your ad at people who are most likely to want your product. A trailer for a student film shown to a film club will likely do better than one shown to everyone. Better aim usually means a higher response rate.

A rule: never spend more to win a customer than that customer gives you. Test small ads first, count what happens, then put more money behind the one that works.

Honesty matters too. A good ad says true things about your product and price.`,
          assignment: {
            prompt: `Design a poster or a 20-second promo for a product or event. Predict how many people it will reach and what percent will respond, then calculate cost per customer and net gain.`,
            tool: 'FABULA',
            postTag: 'ye-ad',
          },
        },
        {
          id: 'ye-68-5',
          title: 'Your First Income Statement',
          blurb: 'Revenue, cost of goods, expenses and net profit on one page.',
          minutes: 20,
          standardIds: ['PFL.BIZ.ACCT', 'PFL.EARN.8'],
          body: `An income statement is a one-page report that shows how a business did over a stretch of time, like a month or a season. It starts with the money that came in and ends with what was kept.

Here are the lines, from top to bottom.

Revenue: total sales.
Cost of goods sold (COGS): the direct cost of the items you sold.
Gross profit: revenue - COGS.
Expenses: other costs of running the business, like ads and booth fees.
Net profit: gross profit - expenses.

Let us build one for a band merch table at a weekend of shows. Revenue was 500 dollars. The shirts and stickers that were sold cost 200 dollars to make: COGS. Gross profit is 500 - 200 = 300 dollars. The band also paid 120 dollars for a booth fee and posters: expenses. Net profit is 300 - 120 = 180 dollars.

What about a bad weekend? Revenue 800, COGS 350, expenses 500. Gross profit is 800 - 350 = 450. Net profit is 450 - 500 = -50. The statement shows a loss of 50 dollars, even though gross profit was positive. That tells you the expenses are too big for this level of sales.

You can also compute a margin: net profit divided by revenue. In the first example, 180 / 500 = 0.36, or 36%. Out of every dollar of sales, 36 cents was kept.

Update your income statement after every event. Over time it shows which products and expenses help, and which do not.`,
          assignment: {
            prompt: `Record a real or pretend week of sales for a small business. Build a one-page income statement with revenue, COGS, gross profit, expenses and net profit, and compute net margin as a percent.`,
            tool: 'PRAXIS',
            postTag: 'ye-income-statement',
          },
        },
      ],
    },

    // ── 9-12 ────────────────────────────────────────────────────────────────────
    {
      id: 'ye-912',
      title: '9-12 Venture',
      blurb: 'Linear break-even models, margin and cash flow, compound growth, funding and equity, and the ethics and law of a small business. Leads into the Praxis venture journey.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ye-912-1',
          title: 'Modeling Break-Even with Linear Equations',
          blurb: 'Write cost and revenue as lines and solve for where they cross.',
          minutes: 22,
          standardIds: ['PFL.BIZ.12', 'CEE.ECON.18.12'],
          body: `Break-even can be written as algebra. Total cost is a linear function of units x:

C(x) = F + v x

where F is fixed cost and v is variable cost per unit. Revenue is R(x) = p x, where p is price. Profit is P(x) = R(x) - C(x).

Take a small record label pressing vinyl. Mastering and artwork cost F = 1,800 dollars. Each record costs v = 6 dollars to press, and sells for p = 15 dollars. Then

C(x) = 1800 + 6x and R(x) = 15x.

Break-even is where R = C. Solve: 15x = 1800 + 6x, so 9x = 1800, so x = 200 records. At 200 records, revenue is 3,000 and cost is 1,800 + 1,200 = 3,000.

Now profit at 300 records: R = 4,500, C = 1,800 + 1,800 = 3,600, so P = 900 dollars. Equivalently P(x) = 9x - 1800, and P(300) = 2,700 - 1,800 = 900.

The profit line P(x) = 9x - 1800 has slope 9, which is the contribution per unit: every extra record sold adds 9 dollars. Its y-intercept, -1,800, is the loss if you sell nothing. The x-intercept, 200, is the break-even point. On a graph, the revenue line crosses the cost line at (200, 3000).

Models let you ask what-if questions quickly. What if the price drops to 12? Then 12x = 1800 + 6x, so 6x = 1800, so x = 300. A 3-dollar lower price makes break-even 100 records further away. What if the pressing plant gives a better v of 5? Solve it yourself.

Remember that a model is a simplification. Real sales may not be steady, and some costs jump. Use the model to think, then test it against the real world.`,
          assignment: {
            prompt: `Build a break-even model for a venture you could launch: choose F, v and p, write C(x), R(x) and P(x), solve for break-even, and sketch the graph. Test two what-if changes and explain the results.`,
            tool: 'PRAXIS',
            postTag: 'ye-linear-model',
          },
        },
        {
          id: 'ye-912-2',
          title: 'Margin and Cash Flow',
          blurb: 'Why a profitable business can still run out of cash.',
          minutes: 22,
          standardIds: ['PFL.BIZ.FIN', 'PFL.EARN.12'],
          body: `Two ideas help you read the health of a business: margin and cash flow.

Gross margin is gross profit divided by revenue, as a percent. For the vinyl record from the last lesson, price 15 and variable cost 6, gross profit per record is 9, so margin = 9 / 15 = 0.60, or 60%. Margin tells you how much of each sales dollar is left to pay fixed costs and become profit. Do not confuse it with markup: markup on the same record is 9 / 6 = 150%.

Margin is useful for comparing products. Digital downloads of the record with a cost of 1 dollar sold at 10 dollars have margin 9 / 10 = 90%. Vinyl has a lower margin but may sell for a premium to collectors.

Now cash flow, the timing of money in and out. Profit is calculated over a period, but cash moves on dates. Imagine a short film that costs 4,000 dollars to make, paid in January, sold for 6,000 dollars, but the buyer pays in 90 days. Profit is 6,000 - 4,000 = 2,000 dollars. Yet for three months your bank balance is 4,000 dollars lower than before. If you have only 500 dollars in cash and a 700-dollar invoice due now, you are short by 200 dollars, even though the deal is profitable on paper.

This is why many healthy small businesses fail: they run out of cash before the customers pay. Solutions include asking for a deposit, shortening payment terms, keeping a cash reserve, or negotiating later due dates with suppliers.

Build a simple cash-flow table by month: starting cash, cash in, cash out, ending cash. If any ending cash is negative, you have found a problem before it finds you.`,
          assignment: {
            prompt: `Make a 6-month cash-flow table for a venture with one large up-front cost and delayed customer payments. Compute gross margin, find the lowest cash balance, and propose two fixes.`,
            tool: 'PRAXIS',
            postTag: 'ye-cash-flow',
          },
        },
        {
          id: 'ye-912-3',
          title: 'Compound Growth',
          blurb: 'When growth builds on growth, small rates become big numbers.',
          minutes: 22,
          standardIds: ['PFL.INVEST.12', 'CEE.ECON.18.12'],
          body: `Simple growth adds the same amount each period. Compound growth adds a percent of the current amount, so each period builds on the last.

The formula: after n periods at rate r, the amount is

A = A0 x (1 + r)^n

Start with 1,000 dollars growing 10% a year for 2 years. Year 1: 1,000 x 1.10 = 1,100. Year 2: 1,100 x 1.10 = 1,210. Using the formula, 1,000 x 1.10^2 = 1,210. Simple growth would give only 1,200, so the extra 10 dollars is growth on the growth.

Now a business case. A shop's monthly sales are 5,000 dollars and grow 10% each month. After 3 months: 5,000 x 1.10^3 = 5,000 x 1.331 = 6,655 dollars. A channel with 2,000 followers growing 50% a month has 2,000 x 1.5^2 = 2,000 x 2.25 = 4,500 after two months. Linear thinking would say 4,000, so compounding surprises people.

A handy shortcut is the Rule of 72: divide 72 by the percent growth rate to estimate the doubling time. At 8% per year, 72 / 8 = 9 years to double. At 6%, about 12 years.

Compounding works against you, too. Debt with interest, or costs that grow every month, compound just as fast. And no business grows at a constant rate forever, so a growth model is a tool for thinking, not a promise.

When you project a venture, always say what rate you assume and why. Ask what would have to be true for it to happen, such as how many new customers each month, and whether the market is big enough.`,
          assignment: {
            prompt: `Project a venture's monthly revenue for 12 months at three growth rates (for example 3%, 6%, 10%). Make a table and graph, find the doubling time with the Rule of 72, and write what would have to be true for each rate.`,
            tool: 'PRAXIS',
            postTag: 'ye-compound',
          },
        },
        {
          id: 'ye-912-4',
          title: 'Funding and Equity Basics',
          blurb: 'Debt versus equity, what a valuation means, and what each costs the founder.',
          minutes: 24,
          standardIds: ['PFL.BIZ.FIN', 'PFL.CREDIT.12'],
          body: `A venture needs money before it makes money. There are two basic ways to fund it. This lesson is education, not advice. Real deals involve contracts and professionals.

Debt is borrowed money you must repay with interest, and the lender does not own part of your business. Say you borrow 10,000 dollars at 6% simple interest for one year. Interest is 10,000 x 0.06 = 600 dollars, so you repay 10,600 dollars.

Equity means selling a share of ownership. An investor who buys equity shares in the risk and the reward, and does not get repaid if the business fails.

Here is how a valuation works. An investor puts in 50,000 dollars for 20% of the company. If 50,000 buys 20%, then the whole company is worth 50,000 / 0.20 = 250,000 dollars after the money goes in. This is the post-money valuation. The value before the investment, the pre-money valuation, is 250,000 - 50,000 = 200,000 dollars.

Before the deal the founder owned 100%. After selling 20%, the founder owns 80%. The founder's 80% of 250,000 is 200,000 dollars, the same as before, but the company now has 50,000 in the bank to grow with. The goal of the funding is to make the pie bigger.

Later rounds dilute everyone. If a new investor takes 25% of the company, existing owners keep 75% of what they had: the founder's 80% becomes 0.80 x 0.75 = 60%. Notice it is 60%, not 55%, because the new share is taken proportionally from everyone.

Each kind of funding has costs. Debt must be repaid even in a slow month. Equity gives up control and future profit. Founders also consider savings, pre-sales and grants. Praxis lets you test these choices with a cap-table calculator.`,
          assignment: {
            prompt: `Use the Praxis cap-table tool or a spreadsheet to model a founder raising a seed round and a later round. Compute pre-money, post-money and the founder's ownership after each, and compare with a loan of the same size.`,
            tool: 'PRAXIS',
            postTag: 'ye-funding',
          },
        },
        {
          id: 'ye-912-5',
          title: 'Ethics and Law of a Small Business',
          blurb: 'Honest dealing, permissions, taxes and keeping trust, in general terms.',
          minutes: 22,
          standardIds: ['PFL.BIZ.12', 'D2.Eco.1.9-12'],
          body: `A business runs on trust. Customers trust that you will deliver what you advertise. Partners trust that you will keep your word. This lesson is a general overview, not legal or tax advice. Rules differ by place, so check with a trusted adult, your local small business office, or a professional.

Honest advertising: say true things about your product and price. Fake reviews and hidden fees damage trust, and in many places they are against the law.

Other people's work: if you sell merch with a song lyric, a photo, a film clip or a logo that someone else made, you generally need their permission or a license. Creating your own art, music and film keeps you clear, and Plajah encourages you to publish original work. Records of who made what, and who agreed to what, protect everyone. A written agreement among band members about splitting money from shows and sales avoids fights later.

Structure and paperwork: many places offer different ways to organize a business, such as running as an individual or forming a company that is a separate legal entity. Each has trade-offs for liability, taxes and record keeping. Ask for local guidance. Businesses often need to register, and some products need licenses or safety rules.

Taxes: sellers often must collect sales tax on purchases and report income. Suppose the local rate is 7% and an item costs 40 dollars. Tax is 40 x 0.07 = 2.80 dollars, so the customer pays 42.80. That 2.80 dollars is not your revenue, because you pass it along. Keeping clear books makes this simple.

Treat people fairly: pay collaborators as agreed, respect their credit, and be honest about mistakes. A reputation takes years to build and a moment to lose.`,
          assignment: {
            prompt: `Write a one-page trust plan for a venture: how you will advertise honestly, whose permission you need for any music, images or footage, how you will track sales tax, and how collaborators will be paid and credited.`,
            tool: 'PRAXIS',
            postTag: 'ye-ethics-law',
          },
        },
      ],
    },
  ],
};
