import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

/** Compact question builder: mcq with 4 choices (rotated so correct answers spread across 0-3). */
const q = (
  lessonId: string,
  n: number,
  level: 1 | 2 | 3,
  prompt: string,
  choices: string[],
  answer: number,
  hint: string,
  explanation: string,
): Question => {
  const k = (lessonId.length * 3 + n * 5 + lessonId.charCodeAt(lessonId.length - 1)) % 4;
  const rotated = choices.map((_, i) => choices[(i - k + 4) % 4]);
  return { id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices: rotated, answer: (answer + k) % 4, hint, explanation, level };
};

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-data',
    label: 'Data Science',
    blurb: 'Probability, statistics and machine learning: how data becomes understanding, from Bayes and Gauss to modern predictive models.',
    accent: '#63E6BE',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-data.t1',
        title: 'Probability and Distributions',
        blurb: 'The mathematics of uncertainty and the shapes data takes.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-data.l01',
            title: 'Probability and Its Origins',
            blurb: 'How games of chance became a theory of uncertainty.',
            minutes: 6,
            body:
              'Probability assigns a number between 0 and 1 to how likely an event is: 0 means impossible, 1 means certain. It began in the 1650s with the correspondence of Pascal and Fermat about games of chance, and grew into a general mathematics of uncertainty. Thomas Bayes wrote about updating beliefs in light of evidence (published in 1763), while Gauss and Laplace used probability to tame errors in astronomical measurements.\n\nThe basic rule is that for equally likely outcomes, probability = favourable outcomes / total outcomes. A fair six-sided die gives a probability of 1/6 for any single face and 3/6 = 0.5 for rolling an odd number. The probabilities of all possible outcomes add up to 1, so the chance something does not happen is 1 minus the chance it does.\n\nA random variable is a quantity whose value depends on chance, and its distribution lists how likely each value is. Probability describes what to expect before the data arrive; statistics works backwards from data to learn about the process that made them.\n\nA weather forecast of a 30 percent chance of rain does not mean it will rain for 30 percent of the day. It means that across many days with similar conditions, it would rain on about 30 out of 100 of them.',
          },
          {
            id: 'lab-data.l02',
            title: 'The Normal Distribution',
            blurb: 'The bell curve and why it shows up everywhere.',
            minutes: 7,
            body:
              'A probability distribution describes how likely each outcome of a random variable is, and is usually summarised by parameters such as a mean (the centre) and a standard deviation (the spread). The most important example is the normal or Gaussian distribution, the bell curve. Gauss derived it as the law of observational errors in his 1809 work Theoria Motus.\n\nIts formula is f(x) = (1 / (sigma x sqrt(2 pi))) x e^(-(x - mu)^2 / (2 sigma^2)), where mu is the mean and sigma is the standard deviation. The curve is symmetric about the mean, and a useful rule of thumb is that about 68 percent of values lie within one standard deviation of the mean, about 95 percent within two, and about 99.7 percent within three.\n\nExample: adult heights in a population might have mean 170 cm and standard deviation 10 cm. Then roughly 68 percent of people are between 160 and 180 cm, and roughly 95 percent are between 150 and 190 cm.\n\nNot all data are normal. Counts (Poisson), yes-or-no trials (binomial), and heavy-tailed quantities such as incomes behave differently. Recognising which distribution generated your data is the first step of an honest analysis. Galton\'s quincunx, a board of pegs through which balls fall into a bell-shaped pile, shows how the normal shape can arise from many small random effects.',
          },
          {
            id: 'lab-data.l03',
            title: 'The Central Limit Theorem',
            blurb: 'Why averages of many samples look normal.',
            minutes: 8,
            body:
              'The central limit theorem (CLT) explains why the normal distribution is so common. It says that if you take the mean of n independent draws from almost any distribution with mean mu and standard deviation sigma, then the standardised mean, (sample mean - mu) / (sigma / sqrt(n)), approaches a standard normal distribution as n grows. The source distribution can be skewed or lumpy, yet the average of many draws is close to bell-shaped.\n\nA key practical result is the standard error: the standard deviation of the sample mean is sigma / sqrt(n). Averaging more data shrinks the uncertainty, but only with the square root of n. If individual measurements have sigma = 20 and you average n = 100 of them, the standard error is 20 / 10 = 2. To halve the uncertainty you need four times as much data.\n\nExample: a single die roll is uniform over 1 to 6 and not bell-shaped at all. But the average of 30 rolls will very rarely be far from 3.5, and across many such averages, the histogram looks like a bell.\n\nLaplace generalised the theorem, and it is why so much classical inference, including confidence intervals and many tests, assumes approximately normal sample means. Be careful, though: the CLT is about averages, not about individual observations, and it needs reasonably independent draws.',
          },
        ],
      },
      {
        id: 'lab-data.t2',
        title: 'Inference and Evidence',
        blurb: 'Updating beliefs, testing claims and measuring relationships.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-data.l04',
            title: 'Bayes\' Theorem',
            blurb: 'How evidence turns a prior into a posterior.',
            minutes: 8,
            body:
              'Bayes\' theorem tells you how to update a belief when new evidence arrives: P(A given B) = P(B given A) x P(A) / P(B). Here P(A) is the prior, your probability before the evidence; P(B given A) is the likelihood; and P(A given B) is the posterior, your updated probability. Bayes\' 1763 essay introduced the idea and Laplace developed it into a general method of inference.\n\nThe theorem corrects a common mistake called the base-rate fallacy. Suppose a disease affects 1 percent of people, and a test detects it in 90 percent of sick people but also wrongly flags 10 percent of healthy people. Imagine 1000 people: 10 are sick and 9 of them test positive; of the 990 healthy people, 99 test positive. A positive result therefore means 9 out of 9 + 99 = 108 chances, about 8 percent, that you are actually sick. The test seems accurate, yet most positives are false because the disease is rare.\n\nThe odds form is also useful: posterior odds = likelihood ratio x prior odds. The likelihood ratio (Bayes factor) shows how strongly the evidence favours one hypothesis over another.\n\nBayesian conclusions depend on the prior, so choosing and justifying it is part of the craft. Still, the posterior can be updated again as more evidence arrives.',
          },
          {
            id: 'lab-data.l05',
            title: 'Hypothesis Testing',
            blurb: 'Deciding when data are surprising enough to reject a null.',
            minutes: 8,
            body:
              'A hypothesis test starts with a null hypothesis, usually a statement of no effect. You then compute a p-value: the probability of seeing data at least as extreme as yours if the null hypothesis were true. If the p-value falls below a chosen threshold alpha, commonly 0.05, you reject the null. Ronald Fisher introduced significance testing and randomised experiments in The Design of Experiments (1935); his Lady Tasting Tea example, where a woman claims she can tell whether milk or tea was poured first, motivated the idea.\n\nJerzy Neyman and Egon Pearson formalised the two kinds of mistake. A false positive (Type I error) rejects a true null, and its rate is alpha. A false negative (Type II error) fails to detect a real effect. Power is the probability of correctly detecting a real effect, and it rises with larger samples.\n\nA p-value of 0.03 does not mean there is a 3 percent chance the null is true. It means that data this extreme would arise about 3 percent of the time if the null were true.\n\nBeware multiple testing: if you run 20 independent tests at alpha = 0.05 when no effects exist, you expect about one false positive by chance alone. Misuse of p-values and multiple comparisons is a leading cause of the reproducibility crisis, so careful design and pre-registration matter.',
          },
          {
            id: 'lab-data.l06',
            title: 'Correlation and Looking at Data',
            blurb: 'Measuring linear relationships and exploring before modelling.',
            minutes: 7,
            body:
              'Francis Galton introduced correlation and regression, and Karl Pearson formalised the correlation coefficient r. It measures the strength and direction of a linear relationship between two variables and always lies between -1 and 1. A value of +1 means a perfect rising line, -1 a perfect falling line, and 0 means no linear relationship. In symbols, r = sum of (x - mean x)(y - mean y), divided by the square root of the product of the sums of squared deviations.\n\nTwo cautions matter. First, correlation is not causation: ice-cream sales and drowning both rise in summer because of temperature, not because one causes the other. Second, r only captures straight-line patterns, so a perfect curved relationship can still give r near 0.\n\nThis is why John Tukey championed exploratory data analysis (EDA) in his 1977 book. Before fitting any model, plot the data: histograms, scatterplots and box plots, which Tukey designed, reveal outliers, curves and clusters that a single number hides. Florence Nightingale showed the power of visualisation earlier, when her polar-area diagram of Crimean War mortality persuaded officials to reform sanitation.\n\nA good habit is to look first, summarise second, and model third.',
          },
        ],
      },
      {
        id: 'lab-data.t3',
        title: 'Modelling Relationships',
        blurb: 'Fitting lines and probabilities to data and judging the fit.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-data.l07',
            title: 'Linear Regression',
            blurb: 'Predicting a number from one or more predictors.',
            minutes: 7,
            body:
              'Regression models a response as a function of predictors. In linear regression, the prediction is a weighted sum: y-hat = b0 + b1 x1 + b2 x2 + and so on. The intercept b0 is the prediction when all predictors are 0, and each coefficient bj is the change in the prediction for a one-unit increase in predictor j, holding the others fixed. That interpretability is why regression connects prediction and explanation.\n\nExample: suppose a model predicts house price (in thousands) as y-hat = 50 + 3 x, where x is the floor area in square metres. A 40 square metre home is predicted at 50 + 3 x 40 = 170 thousand, and every extra square metre adds 3 thousand to the prediction.\n\nThe name comes from Galton, who studied heights and found that very tall parents tend to have children who are tall but closer to the average, a pattern called regression to the mean. This is a statistical tendency, not a force pulling individuals back: when you select extreme values, the next measurement is usually less extreme because part of the extremeness was luck.\n\nA fitted line is only trustworthy within the range of the data it was fitted on. Predicting far outside that range, called extrapolation, can give nonsense, such as a negative price for a very small home if the line were steep.',
          },
          {
            id: 'lab-data.l08',
            title: 'Least Squares and Mean Squared Error',
            blurb: 'How the best line is chosen and how errors are scored.',
            minutes: 8,
            body:
              'How do we choose the best line? The method of least squares, developed by Gauss and Legendre, picks the coefficients that minimise the sum of squared residuals, where a residual is an observed value minus its prediction. Squaring makes all errors positive and penalises big mistakes more than small ones. For linear regression there is a closed-form answer, the ordinary least squares estimator: beta-hat = (X transpose X) inverse times X transpose y, where X is the matrix of predictors and y the vector of responses.\n\nThe usual measure of how well a model predicts is the mean squared error: MSE = (1/n) x sum of (observed - predicted)^2. Smaller is better, and it is expressed in the squared units of the response.\n\nExample: suppose the observed values are 2, 4, 6, 8 and the predictions are 3, 4, 5, 10. The errors are -1, 0, 1 and -2, the squares are 1, 0, 1 and 4, their sum is 6, and the MSE is 6 / 4 = 1.5.\n\nWhy squares? Squared error is easy to optimise and has beautiful mathematics, and under standard assumptions (the Gauss-Markov conditions) least squares gives the best linear unbiased estimator. But it is sensitive to outliers: one wild point can pull the line a long way, which is why exploring data first matters.',
          },
          {
            id: 'lab-data.l09',
            title: 'Logistic Regression and the Sigmoid',
            blurb: 'Turning a score into a probability for yes-or-no outcomes.',
            minutes: 7,
            body:
              'Linear regression predicts a number, but many questions are yes-or-no: will this customer leave, is this email spam? A straight line can output values below 0 or above 1, which make no sense as probabilities. Logistic regression fixes this by passing a linear score z = b0 + b1 x1 + and so on through the sigmoid function: sigma(z) = 1 / (1 + e^(-z)). The sigmoid squashes any number into the range between 0 and 1, so the output can be read as P(y = 1 given x).\n\nUseful values: when z = 0, sigma = 1 / (1 + 1) = 0.5; large positive z gives a probability near 1; large negative z gives a probability near 0. The score z is the log-odds of the outcome, so each coefficient shifts the log-odds. David Cox advanced the methods for binary data.\n\nExample: if a spam model has z = 2 for an email, then e^(-2) is about 0.135 and the probability of spam is about 1 / 1.135, roughly 0.88.\n\nTo pick a class you set a threshold, often 0.5, but the best threshold depends on the cost of each kind of mistake. The sigmoid is also used as an activation in neural networks, and softmax is its multi-class cousin, turning several scores into probabilities that add up to 1. Parameters are usually found by maximum likelihood, choosing the values that make the observed data most probable.',
          },
        ],
      },
      {
        id: 'lab-data.t4',
        title: 'Machine Learning in Practice',
        blurb: 'Generalisation, regularisation, optimisation and compression.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-data.l10',
            title: 'Overfitting and the Bias-Variance Trade-off',
            blurb: 'Why a perfect fit to training data can be a bad model.',
            minutes: 8,
            body:
              'A model overfits when it captures the noise peculiar to its training data rather than the underlying signal. It scores very well on the data it has seen but poorly on new data. The opposite problem, underfitting, happens when a model is too simple to capture the real pattern.\n\nThe bias-variance decomposition makes the trade-off precise: expected squared error = bias squared + variance + irreducible noise. Bias is error from wrong or overly simple assumptions, variance is how much the fitted model would change if trained on a different sample, and irreducible noise is randomness no model can remove. Flexible models, such as a high-degree polynomial, have low bias but high variance; rigid models, such as a straight line through curved data, have high bias but low variance. The best model balances the two.\n\nExample: fitting a 10-degree polynomial through 11 noisy points can pass through every point exactly, giving zero training error, yet it will swing wildly between points and predict new values badly.\n\nThe way to detect overfitting is to hold data back. Evaluate the model on data it was not trained on, and compare training and test errors. A large gap, with low training error and high test error, is the signature of overfitting. Leo Breiman\'s bagging and random forests reduce variance by averaging many trees.',
          },
          {
            id: 'lab-data.l11',
            title: 'Regularisation and Cross-Validation',
            blurb: 'Penalising complexity and honestly measuring performance.',
            minutes: 8,
            body:
              'Regularisation fights overfitting by penalising complexity. Ridge (L2) regression minimises the squared error plus lambda times the sum of squared coefficients, so the model is discouraged from using large coefficients. The strength lambda is a dial: with lambda = 0 you recover ordinary least squares, and as lambda grows coefficients shrink toward 0, trading a little bias for a drop in variance. The lasso, invented by Robert Tibshirani, uses an L1 penalty (the sum of absolute values of coefficients) which can set some coefficients exactly to 0, effectively selecting a smaller set of features.\n\nBut how do you choose lambda, or compare models, honestly? Cross-validation estimates out-of-sample error by repeatedly splitting the data. In k-fold cross-validation you divide the data into k parts, train on k - 1 parts and test on the one left out, rotating until each part has been the test set once, then average the k scores. With 5-fold cross-validation, you train 5 models, each tested on a different 20 percent of the data.\n\nAn important rule is to never tune the model on the same data you use for the final assessment, or your reported error will be optimistically biased. Keep a final test set untouched until the end. Together, regularisation and validation are the standard defences against overfitting.',
          },
          {
            id: 'lab-data.l12',
            title: 'Gradient Descent',
            blurb: 'Finding good parameters by following the slope downhill.',
            minutes: 7,
            body:
              'Many models have no closed-form solution, so we find their parameters by optimisation. Gradient descent minimises a loss function J by repeatedly stepping the parameters in the direction that decreases the loss fastest: theta-new = theta-old - eta x gradient of J. The gradient points uphill, so subtracting it moves downhill, and eta is the learning rate that sets the step size. The earliest description is from Cauchy in 1847.\n\nExample: suppose theta = 5, the learning rate eta = 0.1, and the gradient is 4. The update is 5 - 0.1 x 4 = 4.6. Repeating this moves the parameter step by step toward the minimum, where the gradient is 0 and the steps stop.\n\nThe learning rate matters. Too small and training is painfully slow; too large and the steps overshoot, bouncing around or even diverging. Stochastic and mini-batch versions estimate the gradient from a small random sample of the data, which makes the method scalable to huge datasets and is rooted in the stochastic approximation work of Robbins and Monro in 1951. Adaptive optimisers such as Adam adjust the effective step size for each parameter, and are the default for training most deep networks.\n\nA mountain walker in thick fog who always steps in the steepest downhill direction is a fair picture: it reaches a valley, though on bumpy terrain not always the deepest one.',
          },
          {
            id: 'lab-data.l13',
            title: 'Dimensionality Reduction and PCA',
            blurb: 'Finding the few directions that carry the most information.',
            minutes: 7,
            body:
              'Real datasets often have hundreds of correlated features that conceal a much simpler structure. Dimensionality reduction compresses them into a few informative variables, which makes models simpler and lets us visualise data. Principal component analysis (PCA), first formulated by Karl Pearson in 1901 and developed in modern form by Harold Hotelling in 1933, rotates the data onto new orthogonal axes ordered by how much variance they capture. The first principal component is the direction of greatest spread, the second is the greatest spread at right angles to it, and so on. You keep the first few and drop the rest.\n\nExample: if height and arm length in a group of people are strongly correlated, one component, roughly overall body size, can summarise most of the variation in both. If the first two components explain 70 percent and 20 percent of the variance, together they retain 90 percent.\n\nPCA is linear, so it can miss curved structure. Nonlinear methods such as t-SNE (van der Maaten and Hinton, 2008) and UMAP preserve local neighbourhoods and are good at revealing clusters, but their pictures need careful reading: distances between far-apart clusters are not reliably meaningful.\n\nClustering methods such as k-means group points by similarity without labels. Together with dimensionality reduction they make up unsupervised learning, where we look for structure rather than predict a known target.',
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-data',
    questions: [
      // l01
      q('lab-data.l01', 1, 1, 'What range of values can a probability take?', ['0 to 1', '-1 to 1', '0 to 100 only for percentages above 50', '1 to infinity'], 0, 'Impossible and certain are the endpoints.', 'A probability is between 0 (impossible) and 1 (certain).'),
      q('lab-data.l01', 2, 1, 'What did the Pascal and Fermat correspondence of the 1650s concern?', ['Games of chance', 'Planetary orbits', 'Population surveys', 'Computer networks'], 0, 'Early probability grew from gambling questions.', 'Probability theory began with their letters on problems of games of chance.'),
      q('lab-data.l01', 3, 2, 'A fair six-sided die is rolled once. What is the probability of getting an odd number?', ['1/6', '1/3', '1/2', '2/3'], 2, 'Count the odd faces: 1, 3, 5.', 'Three of six equally likely faces are odd, so the probability is 3/6 = 1/2.'),
      q('lab-data.l01', 4, 3, 'A forecast says there is a 30 percent chance of rain. What is the best interpretation?', ['It will rain for 30 percent of the day', 'In about 30 of 100 similar situations it would rain', 'Rain is impossible', '30 percent of the area will be wet in every case'], 1, 'Think about repeated similar days.', 'Probability describes long-run frequency across similar situations, not the duration or area of rain.'),
      // l02
      q('lab-data.l02', 1, 1, 'Which two parameters summarise a normal distribution?', ['Mean and standard deviation', 'Median and interquartile range', 'Mode and skewness of the sample', 'Minimum and maximum'], 0, 'Centre and spread.', 'The normal distribution is determined by its mean mu and standard deviation sigma.'),
      q('lab-data.l02', 2, 1, 'About what percentage of values in a normal distribution lie within one standard deviation of the mean?', ['50 percent, as for the median split', '68 percent', '95 percent, as for two deviations', '99.7 percent, as for three deviations'], 1, 'The 68-95-99.7 rule.', 'Roughly 68 percent lie within one standard deviation, 95 percent within two and 99.7 percent within three.'),
      q('lab-data.l02', 3, 2, 'Test scores are roughly normal with mean 100 and standard deviation 15. About what proportion of scores lie between 85 and 115?', ['About 68 percent', 'About 95 percent', 'About 50 percent', 'About 99.7 percent'], 0, 'Express 85 and 115 as distances from the mean.', '85 and 115 are exactly one standard deviation below and above the mean, so about 68 percent fall in that range.'),
      q('lab-data.l02', 4, 3, 'Why is it risky to assume all data are normally distributed?', ['Counts, bounded values and heavy-tailed quantities follow other distributions', 'Normal distributions do not have a mean', 'The normal distribution only applies to height', 'Data are never random'], 0, 'Think of incomes or event counts.', 'Real data can be counts, bounded or heavy-tailed, and assuming normality when it does not hold can mislead an analysis.'),
      // l03
      q('lab-data.l03', 1, 1, 'What does the central limit theorem say about the mean of many independent draws?', ['It approaches a normal distribution', 'It shrinks to exactly zero as n grows', 'It always equals the median', 'It becomes uniform'], 0, 'Standardised means look like a bell curve.', 'The standardised sample mean converges to a standard normal as n grows, regardless of the source distribution.'),
      q('lab-data.l03', 2, 1, 'What is the standard error of the sample mean?', ['sigma / sqrt(n)', 'sigma multiplied by n', 'sigma squared divided by n', 'n divided by sigma'], 0, 'It shrinks as n grows, but not linearly.', 'The standard deviation of a sample mean is sigma divided by the square root of n.'),
      q('lab-data.l03', 3, 2, 'Individual measurements have sigma = 20. What is the standard error of the mean of n = 100 measurements?', ['0.2', '2', '10', '20'], 1, 'The square root of 100 is 10.', 'SE = 20 / sqrt(100) = 20 / 10 = 2.'),
      q('lab-data.l03', 4, 3, 'A researcher wants to halve the standard error of a mean. By what factor must the sample size increase?', ['2', '3', '4', '8'], 2, 'Standard error depends on the square root of n.', 'Because SE is proportional to 1 / sqrt(n), halving it requires sqrt(n) to double, so n must be four times larger.'),
      // l04
      q('lab-data.l04', 1, 1, 'In Bayes\' theorem, what is the prior?', ['The probability of a hypothesis before seeing the new evidence', 'The probability of the hypothesis after the evidence has been taken into account', 'The total number of observations', 'The error of the test'], 0, 'Prior means before.', 'The prior P(A) is your belief before the new evidence arrives.'),
      q('lab-data.l04', 2, 1, 'Which concept is usually the cause of the base-rate fallacy?', ['Ignoring how common the condition is to begin with', 'Using too many data points', 'Having a negative correlation between test and outcome', 'Using a random sample'], 0, 'Think about rare diseases and accurate tests.', 'The base-rate fallacy happens when people ignore the prior probability (how common something is).'),
      q('lab-data.l04', 3, 2, 'A disease affects 1 percent of people. A test finds 90 percent of sick people and wrongly flags 10 percent of healthy people. Of 1000 people, about what fraction of positive results are from sick people?', ['About 8 percent', 'About 50 percent', 'About 90 percent', 'About 99 percent'], 0, 'Count true positives: 9. Count false positives: 99.', '9 true positives out of 9 + 99 = 108 positives is about 8 percent.'),
      q('lab-data.l04', 4, 3, 'In the odds form of Bayes\' rule, what does a likelihood ratio greater than 1 tell you?', ['The evidence favours the first hypothesis over the second', 'The prior must be wrong', 'Both hypotheses are false', 'The sample is too small to support any firm conclusion at all'], 0, 'Posterior odds = likelihood ratio x prior odds.', 'A likelihood ratio above 1 raises the odds in favour of the first hypothesis relative to the second.'),
      // l05
      q('lab-data.l05', 1, 1, 'What is a p-value?', ['The probability of data at least this extreme if the null hypothesis were true', 'The probability the null hypothesis is true', 'The size of the effect', 'The sample size'], 0, 'It assumes the null is true.', 'The p-value measures how surprising the data would be under the null hypothesis.'),
      q('lab-data.l05', 2, 1, 'What is a Type I error?', ['Rejecting a true null hypothesis', 'Failing to reject a false null hypothesis', 'Using the wrong p-value for the test', 'Collecting too much data for the test to run'], 0, 'It is a false positive.', 'A Type I error is a false positive: rejecting a null that is actually true.'),
      q('lab-data.l05', 3, 2, 'A test gives p = 0.03 and the chosen alpha is 0.05. What is the decision?', ['Reject the null hypothesis', 'Accept the null hypothesis as proven true', 'Reject only if alpha were 0.01', 'The test must be rerun with a new sample'], 0, 'Compare p with alpha.', 'Since 0.03 is below 0.05, the result is significant at that level and the null is rejected.'),
      q('lab-data.l05', 4, 3, 'A researcher runs 20 independent tests at alpha = 0.05 where no real effects exist. About how many false positives are expected?', ['0', '1', '10', '20'], 1, 'Multiply alpha by the number of tests.', 'Expected false positives = 20 x 0.05 = 1, which is why multiple testing needs correction.'),
      // l06
      q('lab-data.l06', 1, 1, 'What range can the Pearson correlation coefficient r take?', ['-1 to 1', '0 to 1', '0 to 100', '-100 to 100'], 0, 'It can be negative.', 'r always lies between -1 and 1.'),
      q('lab-data.l06', 2, 1, 'Who championed exploratory data analysis and designed the box plot?', ['John Tukey', 'Karl Pearson', 'Thomas Bayes', 'Vladimir Vapnik'], 0, 'He also coined the word bit.', 'John Tukey founded exploratory data analysis and designed the box plot.'),
      q('lab-data.l06', 3, 2, 'Ice-cream sales and drowning deaths are strongly positively correlated across months. What is the best conclusion?', ['A third factor, such as hot weather, probably drives both', 'Ice cream causes drowning', 'Drowning causes ice-cream sales', 'The correlation must be a calculation error'], 0, 'Correlation is not causation.', 'Summer heat increases both swimming and ice-cream buying, so the correlation does not show a causal link between them.'),
      q('lab-data.l06', 4, 3, 'Two variables have a perfect curved (U-shaped) relationship, yet r is close to 0. Why?', ['r only measures linear association', 'The relationship is not real', 'The sample is too large', 'r only works for negative values'], 0, 'What kind of pattern does r detect?', 'Pearson r captures only straight-line relationships, so a strong nonlinear relationship can give a small r.'),
      // l07
      q('lab-data.l07', 1, 1, 'In y-hat = b0 + b1 x, what does b0 represent?', ['The intercept: the prediction when x is 0', 'The slope', 'The residual', 'The sample size'], 0, 'It is the value with no predictor contribution.', 'The intercept b0 is the predicted response when all predictors equal 0.'),
      q('lab-data.l07', 2, 1, 'What does regression to the mean describe?', ['Extreme values tend to be followed by less extreme ones', 'All values eventually become zero', 'Means always equal medians', 'Predictions always fall below the actual observed values in the data'], 0, 'Galton noticed it in parents\' and children\'s heights.', 'When values are selected for being extreme, later measurements tend to be closer to the average.'),
      q('lab-data.l07', 3, 2, 'A model predicts price (thousands) as 50 + 3 x, where x is area in square metres. What is the prediction for 40 square metres?', ['120', '150', '170', '230'], 2, 'Compute 3 x 40 first, then add 50.', '50 + 3 x 40 = 50 + 120 = 170 thousand.'),
      q('lab-data.l07', 4, 3, 'Why is it unwise to use a fitted line far outside the range of its training data?', ['The relationship may not hold there, so predictions can be nonsense', 'Lines can only be used once', 'Coefficients change sign automatically', 'It makes the correlation negative'], 0, 'Think about extrapolation.', 'A fitted relationship is only supported where there are data; extrapolating can give unrealistic predictions.'),
      // l08
      q('lab-data.l08', 1, 1, 'What does least squares minimise?', ['The sum of squared residuals', 'The plain sum of the residuals taken together', 'The number of predictors in the model', 'The largest single prediction'], 0, 'Squaring errors penalises large ones.', 'Least squares chooses coefficients that minimise the sum of squared differences between observed and predicted values.'),
      q('lab-data.l08', 2, 1, 'Which two mathematicians are associated with the method of least squares?', ['Gauss and Legendre', 'Fisher and Neyman', 'Cox and Wald', 'Hastie and Tibshirani'], 0, 'One of them also gave the normal distribution.', 'Gauss and Legendre are credited with the method of least squares.'),
      q('lab-data.l08', 3, 2, 'Observed values are 2, 4, 6, 8 and predictions are 3, 4, 5, 10. What is the mean squared error?', ['1.0', '1.5', '3.0', '6.0'], 1, 'Square each error, add them, divide by 4.', 'Squared errors are 1, 0, 1, 4, which sum to 6; dividing by 4 observations gives 1.5.'),
      q('lab-data.l08', 4, 3, 'Why is least squares sensitive to outliers?', ['Squaring gives large errors disproportionate weight', 'It ignores all large values', 'It only uses the median', 'Outliers are always removed automatically'], 0, 'Compare squaring 10 with squaring 1.', 'Because errors are squared, a single extreme point contributes a very large amount and can pull the fitted line toward it.'),
      // l09
      q('lab-data.l09', 1, 1, 'What range of outputs does the sigmoid function produce?', ['Between 0 and 1', 'Between -1 and 1 inclusive', 'Any real number from negative to positive infinity', 'Only whole numbers such as 0 and 1'], 0, 'This is why it can represent probabilities.', 'The sigmoid maps any real number into the interval between 0 and 1.'),
      q('lab-data.l09', 2, 1, 'What kind of outcome is logistic regression designed for?', ['Binary (yes or no) outcomes', 'Continuous measurements such as temperatures', 'Time stamps', 'Image pixels only'], 0, 'Think of spam versus not spam.', 'Logistic regression models the probability of a binary outcome.'),
      q('lab-data.l09', 3, 2, 'In logistic regression the linear score z equals 0 for a case. What probability does the model give for y = 1?', ['0', '0.25', '0.5', '1'], 2, 'sigma(0) = 1 / (1 + e^0).', 'sigma(0) = 1 / (1 + 1) = 0.5.'),
      q('lab-data.l09', 4, 3, 'Why not use an ordinary straight-line regression to predict a probability?', ['It can output values below 0 or above 1', 'Straight lines cannot be fitted to yes-or-no data at all', 'It always gives exactly 0.5', 'Probabilities must be integers'], 0, 'Think about the allowed range of a probability.', 'A linear model is unbounded and can predict impossible probabilities; the sigmoid keeps outputs between 0 and 1.'),
      // l10
      q('lab-data.l10', 1, 1, 'What is overfitting?', ['Modelling noise in the training data instead of the underlying signal', 'Using too few predictors', 'Training on too little time', 'Choosing a bad learning rate'], 0, 'Good on training data, poor on new data.', 'An overfit model memorises the quirks of its training set and generalises poorly.'),
      q('lab-data.l10', 2, 1, 'Which components make up expected squared error in the bias-variance decomposition?', ['Bias squared, variance and irreducible noise', 'Mean, median and mode', 'Precision, recall and accuracy of the classifier', 'Slope, intercept and residual'], 0, 'Three terms, one of which cannot be removed.', 'Expected error = bias squared + variance + irreducible noise.'),
      q('lab-data.l10', 3, 2, 'A model has a training error of 0.1 and a test error of 2.5. What does this most likely indicate?', ['Overfitting', 'Underfitting', 'A perfect model', 'Too much irreducible noise'], 0, 'Compare the two errors.', 'A large gap between very low training error and high test error is the signature of overfitting.'),
      q('lab-data.l10', 4, 3, 'A very flexible model has low bias. Why can it still perform badly on new data?', ['Its high variance means it fits the noise in each training sample', 'Low bias always guarantees accuracy', 'It uses too few parameters', 'It never sees training data'], 0, 'Think about how much the fit changes between samples.', 'Flexible models can change a lot with each sample (high variance), so low bias alone does not ensure good generalisation.'),
      // l11
      q('lab-data.l11', 1, 1, 'What does ridge (L2) regularisation penalise?', ['Large squared coefficients', 'Small coefficients', 'The number of rows in the training data', 'The learning rate'], 0, 'It adds lambda times a sum over coefficients.', 'Ridge adds a penalty proportional to the sum of squared coefficients, shrinking them.'),
      q('lab-data.l11', 2, 1, 'Which method uses an L1 penalty and can set some coefficients exactly to zero?', ['The lasso', 'Ridge regression', 'Ordinary least squares', 'Bagging of many decision trees'], 0, 'Invented by Robert Tibshirani.', 'The lasso uses an L1 penalty, which induces sparsity by zeroing some coefficients.'),
      q('lab-data.l11', 3, 2, 'In 5-fold cross-validation, what fraction of the data is used for testing in each round?', ['5 percent', '10 percent', '20 percent', '50 percent'], 2, 'Divide the data into 5 equal parts.', 'Each fold is one of 5 equal parts, so 1/5 = 20 percent is held out each time.'),
      q('lab-data.l11', 4, 3, 'What happens as the ridge strength lambda is increased a lot?', ['Coefficients shrink toward zero, raising bias and lowering variance', 'Coefficients grow without limit', 'The model becomes ordinary least squares', 'Variance increases'], 0, 'A bigger penalty means smaller coefficients.', 'Stronger regularisation shrinks coefficients, making the model simpler: more bias but less variance.'),
      // l12
      q('lab-data.l12', 1, 1, 'In gradient descent, what does the learning rate eta control?', ['The size of each step', 'The number of features', 'The direction uphill', 'The sample size'], 0, 'It scales the gradient.', 'Eta scales the step taken against the gradient at each update.'),
      q('lab-data.l12', 2, 1, 'Which direction does gradient descent move the parameters?', ['Against the gradient', 'Along the gradient', 'At random', 'Toward the largest parameter'], 0, 'The gradient points uphill.', 'It subtracts the gradient, moving in the direction of steepest decrease of the loss.'),
      q('lab-data.l12', 3, 2, 'Starting at theta = 5 with learning rate 0.1 and gradient 4, what is the new theta?', ['4.6', '4.0', '5.4', '0.4'], 0, 'theta - eta x gradient.', '5 - 0.1 x 4 = 5 - 0.4 = 4.6.'),
      q('lab-data.l12', 4, 3, 'What is the most likely result of using a learning rate that is far too large?', ['Steps overshoot, so the loss may bounce or diverge', 'The algorithm converges faster and more precisely', 'The gradient becomes zero immediately', 'Nothing changes'], 0, 'Imagine leaping over the valley.', 'Overly large steps can jump past the minimum repeatedly, so training oscillates or diverges.'),
      // l13
      q('lab-data.l13', 1, 1, 'What does the first principal component represent?', ['The direction of greatest variance in the data', 'The direction along which the data vary the least', 'The mean of the data', 'The number of clusters'], 0, 'PCA orders axes by variance.', 'The first principal component is the direction along which the data vary the most.'),
      q('lab-data.l13', 2, 1, 'Which methods are nonlinear techniques for visualising high-dimensional data?', ['t-SNE and UMAP', 'Ridge and lasso', 'OLS and mean squared error', 'Bagging and boosting'], 0, 'They reveal cluster structure.', 't-SNE and UMAP are nonlinear embeddings that preserve local neighbourhoods.'),
      q('lab-data.l13', 3, 2, 'The first two principal components explain 70 percent and 20 percent of the variance. How much do the two retain together?', ['50 percent', '70 percent', '90 percent', '140 percent'], 2, 'Principal components are orthogonal, so their variances add.', 'The variances of orthogonal components add: 70 + 20 = 90 percent.'),
      q('lab-data.l13', 4, 3, 'Why is it a mistake to read exact distances between far-apart clusters on a t-SNE plot as precise?', ['t-SNE preserves local neighbourhoods, not global distances', 't-SNE removes all clusters', 'Distances are always exact in t-SNE', 'It only works on two data points'], 0, 'Think about what the method tries to preserve.', 'The method preserves local structure, so global distances between clusters are not reliably meaningful.'),
    ],
  },
};
