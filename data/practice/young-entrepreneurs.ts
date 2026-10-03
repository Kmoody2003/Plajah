/**
 * Practice bank for the Young Entrepreneurs curriculum — 4 questions per lesson, 80 total.
 * Each row is [prompt, correct, [3 wrong choices], hint, explanation, level]. The correct choice is
 * placed at a rotating index so answers spread across 0-3.
 */
import type { Question, QuestionBank } from './types';

type Row = [string, string, [string, string, string], string, string, 1 | 2 | 3];

const ROT = [2, 0, 3, 1];
let counter = 0;

function build(lessonId: string, rows: Row[]): Question[] {
  return rows.map((r, i) => {
    const pos = ROT[counter++ % 4];
    const choices = [...r[2]];
    choices.splice(pos, 0, r[1]);
    return {
      id: `${lessonId}.q${i + 1}`,
      lessonId,
      kind: 'mcq' as const,
      prompt: r[0],
      choices,
      answer: pos,
      hint: r[3],
      explanation: r[4],
      level: r[5],
    };
  });
}

const L: Record<string, Row[]> = {
  'ye-k2-1': [
    ['How many cents is a nickel worth?', '5', ['1', '10', '25'], 'Count by fives.', 'A nickel is worth 5 cents.', 1],
    ['Which coin is worth the most?', 'Quarter', ['Penny', 'Nickel', 'Dime'], 'Look at the number, not the size.', 'A quarter is 25 cents, more than the others.', 1],
    ['You have 2 dimes. How many cents?', '20', ['2', '12', '25'], 'Count by tens.', 'A dime is 10 cents, so 10 and 10 is 20.', 1],
    ['You have 1 quarter and 1 nickel. How many cents?', '30', ['26', '35', '20'], 'Start at 25, then count 5 more.', '25 plus 5 is 30 cents.', 2],
  ],
  'ye-k2-2': [
    ['Which one is a need?', 'Food', ['A toy robot', 'Candy', 'A video game'], 'What keeps your body healthy?', 'Food is a need. The others are nice to have.', 1],
    ['Which one is a want?', 'A sparkly toy', ['Water', 'A coat in snow', 'Breakfast'], 'You can live without it.', 'A toy is a want. We can live without it.', 1],
    ['Mia has 3 coins. She needs a pencil for school. What should she buy first?', 'The pencil', ['A sticker', 'A toy car', 'Candy'], 'Needs come before wants.', 'The pencil is a need, so Mia buys it first.', 2],
    ['Why do we have to choose what to buy?', 'We cannot buy everything', ['Money is free', 'Shops are closed', 'Coins are heavy'], 'Think about how many coins you have.', 'Money is limited, so we choose.', 2],
  ],
  'ye-k2-3': [
    ['Swapping things without money is called...', 'Trading', ['Saving', 'Counting', 'Spending'], 'Think of a swap.', 'Trading things without money is called bartering.', 1],
    ['Sam gives 2 stickers for 1 cookie. He does it twice. How many stickers did he give?', '4', ['2', '3', '5'], 'Count by twos.', '2 and 2 is 4 stickers.', 1],
    ['Why is money handy for trading?', 'Everyone will take it', ['It is pretty', 'It is heavy', 'It is always shiny'], 'Think about who accepts coins.', 'Everyone agrees to accept money, so it makes trading easy.', 1],
    ['A trade is fair when...', 'Both people are happy', ['One person is forced', 'One person is tricked', 'Nobody agrees'], 'Think about how both people feel.', 'A fair trade is one both people are happy to make.', 1],
  ],
  'ye-k2-4': [
    ['In a shop, who is the person who buys?', 'The customer', ['The seller', 'The banker', 'The farmer'], 'The seller sells. Who is the other person?', 'The buyer is called the customer.', 1],
    ['A button costs 10 cents. You sell 3. How much money?', '30 cents', ['13 cents', '20 cents', '40 cents'], 'Count by tens three times.', '10, 20, 30. That is 30 cents.', 1],
    ['A sticker costs 5 cents. You sell 4. How much money?', '20 cents', ['9 cents', '15 cents', '25 cents'], 'Count by fives four times.', '5, 10, 15, 20. That is 20 cents.', 1],
    ['You open a lemonade shop. What should you do before you open?', 'Make a sign and set prices', ['Close the shop', 'Hide the lemonade', 'Give away all the coins'], 'Customers need to know something.', 'A sign with prices tells customers what to buy.', 1],
  ],
  'ye-k2-5': [
    ['Saving means...', 'Keeping money for later', ['Spending it now', 'Losing it', 'Giving it all away'], 'Think about later.', 'Saving is keeping some money for later.', 1],
    ['Lily saves 5 cents a day for 4 days. How many cents?', '20 cents', ['9 cents', '15 cents', '25 cents'], 'Count by fives four times.', '5, 10, 15, 20. Lily has 20 cents.', 1],
    ['A toy costs 25 cents. Jo has 20 cents. How many more cents does Jo need?', '5 cents', ['4 cents', '10 cents', '45 cents'], 'Count up from 20 to 25.', '25 minus 20 is 5 cents.', 2],
    ['Which is a safe place to keep savings?', 'A piggy bank at home', ['The playground', 'A puddle', 'A stranger\'s pocket'], 'Think of a place that is yours and safe.', 'A piggy bank or a bank keeps savings safe.', 1],
  ],

  'ye-35-1': [
    ['To make a profit, the price must be higher than...', 'The cost to make it', ['The number of customers', 'The color', 'The shop name'], 'Think about what you spent.', 'If price is above cost, you keep the difference as profit.', 1],
    ['A bracelet costs $2 to make and sells for $5. How much is left over per sale?', '$3', ['$2', '$5', '$7'], 'Subtract the cost from the price.', '$5 minus $2 is $3.', 2],
    ['Cookies sell for $1.50 each. What is the revenue from 10 cookies?', '$15', ['$150', '$11.50', '$10'], 'Two cookies are $3.', '10 x $1.50 is $15.', 2],
    ['Lemonade costs 40 cents a cup to make. Which price would lose money?', '30 cents', ['50 cents', '75 cents', '1 dollar'], 'Compare each price to 40 cents.', 'At 30 cents you lose 10 cents on every cup.', 2],
  ],
  'ye-35-2': [
    ['Revenue is...', 'All the money that comes in from sales', ['Money you spend', 'Money left after costs', 'Money you borrow'], 'It is the top line of the story.', 'Revenue is total sales before costs are taken out.', 1],
    ['A film night sells 50 tickets at $2 each. What is the revenue?', '$100', ['$52', '$25', '$150'], 'Multiply tickets by price.', '50 x $2 is $100.', 2],
    ['Revenue is $120 and costs are $50. What is the profit?', '$70', ['$170', '$60', '$50'], 'Profit is revenue minus costs.', '$120 minus $50 is $70.', 2],
    ['A class sells 30 tickets at $4 and has $135 in costs. What happened?', 'A loss of $15', ['A profit of $15', 'A profit of $255', 'It broke even'], 'Find revenue first, then compare with costs.', 'Revenue is $120. $120 minus $135 is negative $15, a loss.', 3],
  ],
  'ye-35-3': [
    ['The items a store has ready to sell are called...', 'Inventory', ['Revenue', 'Profit', 'A budget'], 'They sit on the shelf.', 'Goods waiting to be sold are inventory.', 1],
    ['You buy 20 erasers for $10. What did each cost?', '$0.50', ['$0.20', '$1.00', '$2.00'], 'Divide the total by the number of items.', '$10 divided by 20 is $0.50.', 2],
    ['You earn $0.25 profit on each pencil. What is the profit on 8 pencils?', '$2.00', ['$6.00', '$4.00', '$0.25'], 'Multiply the profit by 8.', '8 x $0.25 is $2.00.', 2],
    ['A store has 30 items and sells 18. How many are left?', '12', ['48', '18', '10'], 'Subtract what was sold.', '30 minus 18 is 12 items left.', 1],
  ],
  'ye-35-4': [
    ['A budget is a plan for...', 'How you will use money you expect', ['The weather', 'A game', 'A recipe'], 'Think about where money goes.', 'A budget plans the use of money before you spend it.', 1],
    ['Income is $30. You plan $18 for supplies and $2 to share. How much is left to save?', '$10', ['$12', '$14', '$8'], 'Add the plans, then subtract from $30.', '$18 plus $2 is $20, and $30 minus $20 is $10.', 2],
    ['Which is income?', 'Money earned from selling lemonade', ['Money paid for supplies', 'A bill you owe', 'Money given away'], 'Income comes in.', 'Income is money that comes in, like earnings from sales.', 1],
    ['A band plans to spend one fourth of $80 on posters. How much is that?', '$20', ['$4', '$25', '$40'], 'Divide by 4.', '$80 divided by 4 is $20.', 2],
  ],
  'ye-35-5': [
    ['Feedback is...', 'What customers tell you about your product', ['Your prices', 'A bill', 'A tax'], 'It comes from customers.', 'Feedback helps you improve what you sell.', 1],
    ['20 students try a cookie and 14 like it. What percent liked it?', '70%', ['14%', '60%', '80%'], 'Divide 14 by 20.', '14 divided by 20 is 0.70, or 70%.', 2],
    ['12 of 30 students say they would buy a poster. What fraction is that, simplified?', '2/5', ['1/2', '3/5', '1/3'], 'Divide top and bottom by 6.', '12/30 simplifies to 2/5.', 2],
    ['A customer says your lemonade is too sour. What is the best response?', 'Try less lemon and ask again', ['Ignore it', 'Argue', 'Raise the price'], 'Use what you hear.', 'Good sellers use feedback to improve.', 1],
  ],

  'ye-68-1': [
    ['Contribution per unit equals...', 'Price minus variable cost per unit', ['Price plus cost', 'Cost minus price', 'Total sales'], 'What is left from one sale?', 'It is what one sale gives toward fixed costs and profit.', 1],
    ['A bracelet sells for $4 and costs $1.50 to make. What is the contribution?', '$2.50', ['$5.50', '$1.50', '$3.50'], 'Subtract.', '$4.00 minus $1.50 is $2.50.', 2],
    ['Each sticker pack gives $2.50 contribution. What do 60 give?', '$150', ['$62.50', '$120', '$250'], 'Multiply by 60.', '60 x $2.50 is $150.', 2],
    ['A band tee sells for $15 and costs $9 per shirt to print and ship. What is the contribution per shirt?', '$6', ['$24', '$9', '$3'], 'Price minus cost.', '$15 minus $9 is $6.', 2],
  ],
  'ye-68-2': [
    ['Markup percent is figured as a percent of...', 'The cost', ['The price', 'The profit', 'The sales tax'], 'What do you add the markup on top of?', 'Markup = (price minus cost) divided by cost.', 2],
    ['A hat costs $20 and the markup is 50%. What is the price?', '$30', ['$25', '$40', '$70'], 'Find 50% of 20, then add.', '50% of $20 is $10, so the price is $30.', 2],
    ['A $40 poster is 25% off. What is the sale price?', '$30', ['$15', '$35', '$10'], '25% off means paying 75%.', '25% of $40 is $10, so $40 minus $10 is $30.', 2],
    ['A tee costs $8 and sells for $14. What is the markup percent?', '75%', ['43%', '60%', '175%'], 'Find the difference, then divide by the cost.', '$6 divided by $8 is 0.75, or 75%.', 3],
  ],
  'ye-68-3': [
    ['The break-even point is where...', 'Revenue equals total costs', ['Profit is highest', 'Costs are zero', 'Price is zero'], 'Profit is zero there.', 'At break-even you neither make nor lose money.', 1],
    ['Fixed costs are $120 and contribution is $6 per unit. How many units to break even?', '20', ['720', '114', '126'], 'Divide the fixed costs by the contribution.', '$120 divided by $6 is 20 units.', 2],
    ['A screen setup costs $90 and each tee has $5 contribution. What is the break-even?', '18', ['450', '95', '9'], 'Fixed cost divided by contribution.', '$90 divided by $5 is 18 tees.', 2],
    ['A hall costs $200. Tickets are $5 with no per-ticket cost. How many tickets to break even?', '40', ['1,000', '195', '205'], 'Divide, do not multiply.', '$200 divided by $5 is 40 tickets.', 2],
  ],
  'ye-68-4': [
    ['Aiming ads at the people most likely to buy is called...', 'Targeting', ['Markup', 'Inventory', 'Depreciation'], 'Think of aiming.', 'Targeting raises the chance that viewers become customers.', 1],
    ['A $60 ad brings 30 customers. What is the cost per customer?', '$2', ['$0.50', '$30', '$90'], 'Divide ad cost by customers.', '$60 divided by 30 is $2.', 2],
    ['A $50 ad reaches 2,000 people and 2% buy. How many buyers?', '40', ['4', '400', '100'], '2% is 0.02.', '0.02 x 2,000 is 40 buyers.', 2],
    ['Each customer gives $5 contribution. A $50 ad brought 40 customers. What is the net gain?', '$150', ['$200', '$50', '$250'], 'Find total contribution, then subtract the ad cost.', '40 x $5 is $200, and $200 minus $50 is $150.', 3],
  ],
  'ye-68-5': [
    ['An income statement shows...', 'Revenue, costs and profit over a period', ['What you own on one day', 'Only the cash in the bank', 'What the owner wishes for'], 'It covers a stretch of time.', 'It summarizes how the business did over a period.', 1],
    ['Revenue is $500 and cost of goods sold is $200. What is the gross profit?', '$300', ['$700', '$200', '$100'], 'Subtract.', '$500 minus $200 is $300.', 2],
    ['Gross profit is $300 and expenses are $120. What is the net profit?', '$180', ['$420', '$120', '$300'], 'Subtract expenses from gross profit.', '$300 minus $120 is $180.', 2],
    ['Revenue $800, COGS $350, expenses $500. What is the result?', 'A loss of $50', ['A profit of $50', 'A profit of $450', 'A loss of $500'], 'Find gross profit first.', 'Gross profit is $450, and $450 minus $500 is negative $50.', 3],
  ],

  'ye-912-1': [
    ['In C(x) = F + vx, what does v stand for?', 'Variable cost per unit', ['Fixed costs', 'The price', 'The revenue'], 'It multiplies the number of units.', 'v is the cost that grows with each unit.', 1],
    ['R = 12x and C = 800 + 4x. At what x do they break even?', '100', ['200', '50', '67'], 'Set 12x equal to 800 + 4x and solve.', '8x = 800, so x = 100.', 2],
    ['A label has F = 1800, v = 6 and p = 15. What is the profit at 300 records?', '$900', ['$2,700', '$3,600', '$1,800'], 'Revenue minus total cost.', 'Revenue is 4,500, cost is 3,600, so profit is 900.', 3],
    ['Profit is P(x) = 9x - 1800. What does the slope 9 mean?', 'Each extra unit adds $9 profit', ['Fixed cost is $9', 'Break-even is 9 units', 'The price is $9'], 'Slope is change per unit.', 'The slope is the contribution per unit.', 3],
  ],
  'ye-912-2': [
    ['Gross margin percent is...', 'Gross profit divided by revenue', ['Gross profit divided by cost', 'Cost divided by revenue', 'Price divided by cost'], 'The base is sales.', 'Margin uses revenue as the base.', 1],
    ['A record sells for $15 and costs $6. What is the gross margin?', '60%', ['40%', '150%', '9%'], 'Gross profit is 9. Divide by the price.', '9 divided by 15 is 0.60, or 60%.', 2],
    ['You have $500 in cash and must pay a $700 invoice now. Customers pay later. What is your position?', 'Short by $200', ['Ahead by $200', 'Short by $700', 'Ahead by $1,200'], 'Compare the cash with the bill.', '$500 minus $700 is negative $200.', 2],
    ['A film costs $4,000 and sells for $6,000, paid in 90 days. What is the profit?', '$2,000', ['$6,000', '$4,000', '$10,000'], 'Revenue minus cost, though cash arrives late.', 'Profit is $2,000, but cash is out $4,000 until paid.', 2],
  ],
  'ye-912-3': [
    ['Compound growth means...', 'Growth builds on earlier growth', ['The same amount is added each time', 'Growth stops', 'It only applies to savings'], 'Each period starts from a larger amount.', 'Each period grows from the current amount.', 1],
    ['$1,000 grows 10% a year for 2 years. What is the value?', '$1,210', ['$1,200', '$1,100', '$1,020'], 'Multiply by 1.10 twice.', '1,000 x 1.10 x 1.10 is 1,210.', 2],
    ['2,000 followers grow 50% a month. How many after 2 months?', '4,500', ['4,000', '3,000', '6,000'], 'Multiply by 1.5 twice.', '2,000 x 1.5 x 1.5 is 4,500.', 2],
    ['Using the Rule of 72, about how long to double at 8% a year?', '9 years', ['12 years', '8 years', '64 years'], 'Divide 72 by the rate.', '72 divided by 8 is 9 years.', 2],
  ],
  'ye-912-4': [
    ['Equity means...', 'A share of ownership', ['A loan', 'A bill', 'Interest'], 'Think of owning a slice.', 'Equity is part ownership of the company.', 1],
    ['An investor pays $50,000 for 20%. What is the post-money valuation?', '$250,000', ['$200,000', '$50,000', '$1,000,000'], 'Divide the money by the share.', '50,000 divided by 0.20 is 250,000.', 3],
    ['You borrow $10,000 at 6% simple interest for one year. What do you repay?', '$10,600', ['$10,060', '$16,000', '$600'], 'Add the interest to the amount borrowed.', 'Interest is $600, so you repay $10,600.', 2],
    ['A founder owns 80%. A new investor then takes 25% of the company. What does the founder own?', '60%', ['55%', '75%', '80%'], 'The founder keeps 75% of their share.', '80% x 0.75 is 60%.', 3],
  ],
  'ye-912-5': [
    ['Selling merch with someone else\'s song lyrics generally requires...', 'Permission or a license', ['Nothing', 'Only a thank you', 'Asking friends'], 'Think about who owns the lyrics.', 'Owners usually must permit use of their work.', 1],
    ['Sales tax is 7% on a $40 item. What is the tax?', '$2.80', ['$7.00', '$0.28', '$4.00'], 'Multiply 40 by 0.07.', '$40 x 0.07 is $2.80.', 2],
    ['With 7% tax on a $40 item, what does the customer pay in total?', '$42.80', ['$47.00', '$40.28', '$44.80'], 'Add the tax to the price.', '$40 plus $2.80 is $42.80.', 2],
    ['Which advertising practice is honest?', 'Stating real features and the real price', ['Posting fake reviews', 'Hiding extra fees', 'Claiming what is not true'], 'Honest means true.', 'Honest ads say true things about the product and price.', 1],
  ],
};

const questions: Question[] = Object.entries(L).flatMap(([lessonId, rows]) => build(lessonId, rows));

export const YOUNG_ENT_BANK: QuestionBank = {
  curriculumId: 'young-entrepreneurs',
  questions,
};
