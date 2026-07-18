// ─────────────────────────────────────────────────────────────────────────────
// Data Science discipline data for Plajah Academia's science studios.
// Accuracy-first: every figure carries a real Wikipedia slug so portraits +
// biographies enrich live at runtime; every law is KaTeX-ready; every tool URL
// points at a real, free resource. Conforms to ScienceDisciplineData (./types).
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'data',
  label: 'Data Science',
  icon: 'TrendingUp',
  accent: '#63E6BE',
  accent2: '#0CA678',
  tagline: 'Turning data into understanding through statistics, inference and machine learning.',
  heroBlurb:
    'Data science sits where statistics, computing and domain knowledge meet — cleaning and exploring data, modelling uncertainty, and drawing conclusions that hold up. From Bayes and Gauss to modern predictive modelling, learn the ideas, the mathematics and the open tools that turn raw numbers into insight.',
  arXivCategory: 'stat.ML',
  arXivQuery: 'data science statistics inference',
  simulators: ['function-plotter'],

  figureHalls: [
    { id: 'statistics', label: 'Statistics', blurb: 'The founders of probability, estimation and statistical inference — the mathematical bedrock of data analysis.' },
    { id: 'inference', label: 'Inference & Bayes', blurb: 'Thinkers who formalised how evidence updates belief, from Bayes to modern experimental design.' },
    { id: 'learning', label: 'Machine Learning', blurb: 'Pioneers who built algorithms that learn patterns and predict from data.' },
    { id: 'modern', label: 'Modern Data Science', blurb: 'The statisticians and engineers who defined data analysis, visualisation and the discipline itself.' },
  ],

  figures: [
    // ── Statistics
    {
      id: 'gauss', name: 'Carl Friedrich Gauss', wikiSlug: 'Carl_Friedrich_Gauss', hall: 'statistics',
      role: 'Mathematician', era: 'Foundations', nationality: 'German', years: '1777–1855',
      tagline: 'Gave the normal distribution and least squares.',
      works: ['Method of least squares', 'Gaussian (normal) distribution', 'Theoria Motus (1809)'],
      techniques: ['Formalised the normal distribution of errors', 'Developed least-squares estimation', 'Applied statistics to astronomy and geodesy'],
    },
    {
      id: 'laplace', name: 'Pierre-Simon Laplace', wikiSlug: 'Pierre-Simon_Laplace', hall: 'statistics',
      role: 'Mathematician & astronomer', era: 'Foundations', nationality: 'French', years: '1749–1827',
      tagline: 'Founder of Bayesian probability and the central limit theorem.',
      works: ['Théorie analytique des probabilités (1812)', 'Central limit theorem', 'Laplace transform'],
      techniques: ['Advanced the probabilistic interpretation of inference', 'Generalised the central limit theorem', 'Applied probability to celestial mechanics'],
    },
    {
      id: 'galton', name: 'Francis Galton', wikiSlug: 'Francis_Galton', hall: 'statistics',
      role: 'Statistician & polymath', era: 'Victorian', nationality: 'British', years: '1822–1911',
      tagline: 'Discovered correlation and regression to the mean.',
      works: ['Regression toward the mean', 'Correlation coefficient (concept)', 'Standard deviation applications'],
      techniques: ['Introduced correlation and regression', 'Pioneered the use of surveys and questionnaires', 'Developed statistical methods for heredity data'],
    },
    {
      id: 'pearson', name: 'Karl Pearson', wikiSlug: 'Karl_Pearson', hall: 'statistics',
      role: 'Statistician', era: 'Foundations of modern statistics', nationality: 'British', years: '1857–1936',
      tagline: 'Founder of mathematical statistics.',
      works: ['Pearson correlation coefficient', 'Chi-squared test', 'Principal component analysis (origin)', 'Biometrika journal'],
      techniques: ['Formalised the correlation coefficient', 'Invented the chi-squared goodness-of-fit test', 'Established the first university statistics department'],
    },
    {
      id: 'fisher', name: 'Ronald Fisher', wikiSlug: 'Ronald_Fisher', hall: 'statistics',
      role: 'Statistician & geneticist', era: 'Modern statistics', nationality: 'British', years: '1890–1962',
      tagline: 'Father of modern statistics and experimental design.',
      works: ['Maximum likelihood estimation', 'Analysis of variance (ANOVA)', 'The Design of Experiments (1935)', 'p-value & significance testing'],
      techniques: ['Formalised maximum-likelihood estimation', 'Invented ANOVA and randomised experimental design', 'Introduced the concept of statistical significance'],
    },

    // ── Inference & Bayes
    {
      id: 'bayes', name: 'Thomas Bayes', wikiSlug: 'Thomas_Bayes', hall: 'inference',
      role: 'Statistician & minister', era: 'Foundations', nationality: 'British', years: 'c. 1701–1761',
      tagline: 'Namesake of Bayesian inference.',
      works: ['An Essay towards Solving a Problem in the Doctrine of Chances (1763)', 'Bayes’ theorem'],
      techniques: ['Formulated how to update probabilities with new evidence', 'His theorem underlies modern probabilistic inference', 'Founded the Bayesian school of statistics'],
    },
    {
      id: 'neyman', name: 'Jerzy Neyman', wikiSlug: 'Jerzy_Neyman', hall: 'inference',
      role: 'Statistician', era: 'Modern statistics', nationality: 'Polish-American', years: '1894–1981',
      tagline: 'Co-founder of hypothesis testing and confidence intervals.',
      works: ['Neyman–Pearson lemma', 'Confidence intervals', 'Theory of hypothesis testing'],
      techniques: ['Introduced confidence intervals for estimation', 'Formalised hypothesis testing with Egon Pearson', 'Advanced survey-sampling theory'],
    },
    {
      id: 'wald', name: 'Abraham Wald', wikiSlug: 'Abraham_Wald', hall: 'inference',
      role: 'Statistician', era: 'Modern statistics', nationality: 'Hungarian-American', years: '1902–1950',
      tagline: 'Founder of statistical decision theory.',
      works: ['Sequential analysis', 'Statistical decision theory', 'Survivorship-bias analysis'],
      techniques: ['Founded decision theory and sequential testing', 'Analysed survivorship bias in wartime aircraft', 'Advanced the theory of optimal statistical decisions'],
    },
    {
      id: 'cox', name: 'David Cox', wikiSlug: 'David_Cox_(statistician)', hall: 'inference',
      role: 'Statistician', era: 'Contemporary', nationality: 'British', years: '1924–2022',
      tagline: 'Creator of the proportional-hazards model.',
      works: ['Cox proportional-hazards model', 'Logistic regression (development)', 'Point Processes'],
      techniques: ['Developed the leading model for survival analysis', 'Advanced logistic regression and binary data methods', 'Bridged theory and applied statistics across sciences'],
    },

    // ── Machine Learning
    {
      id: 'tukey', name: 'John Tukey', wikiSlug: 'John_Tukey', hall: 'modern',
      role: 'Statistician', era: 'Modern statistics', nationality: 'American', years: '1915–2000',
      tagline: 'Pioneer of exploratory data analysis; coined "bit" and "software".',
      works: ['Exploratory Data Analysis (1977)', 'Fast Fourier Transform (with Cooley)', 'Box plot', 'The word "bit"'],
      techniques: ['Founded exploratory data analysis (EDA)', 'Co-invented the FFT algorithm', 'Designed the box plot and stem-and-leaf display'],
    },
    {
      id: 'breiman', name: 'Leo Breiman', wikiSlug: 'Leo_Breiman', hall: 'learning',
      role: 'Statistician', era: 'Machine learning', nationality: 'American', years: '1928–2005',
      tagline: 'Inventor of random forests and CART.',
      works: ['Classification and Regression Trees (CART)', 'Random forests', 'Bagging (bootstrap aggregating)'],
      techniques: ['Created decision-tree ensemble methods', 'Invented random forests and bagging', 'Championed the "algorithmic modelling" culture'],
    },
    {
      id: 'vapnik', name: 'Vladimir Vapnik', wikiSlug: 'Vladimir_Vapnik', hall: 'learning',
      role: 'Statistician & computer scientist', era: 'Machine learning', nationality: 'Soviet-American', years: 'b. 1936',
      tagline: 'Co-inventor of the support vector machine.',
      works: ['Support vector machines', 'VC dimension', 'Statistical learning theory'],
      techniques: ['Founded statistical learning theory', 'Invented support vector machines and kernels', 'Defined the VC dimension of learnability'],
    },
    {
      id: 'hastie', name: 'Trevor Hastie', wikiSlug: 'Trevor_Hastie', hall: 'learning',
      role: 'Statistician', era: 'Statistical learning', nationality: 'South African-American', years: 'b. 1953',
      tagline: 'Co-author of The Elements of Statistical Learning.',
      works: ['The Elements of Statistical Learning', 'Generalized additive models', 'Lasso / glmnet'],
      techniques: ['Developed generalized additive models', 'Advanced regularised regression (lasso, elastic net)', 'Bridged statistics and machine learning pedagogy'],
    },
    {
      id: 'tibshirani', name: 'Robert Tibshirani', wikiSlug: 'Robert_Tibshirani', hall: 'learning',
      role: 'Statistician', era: 'Statistical learning', nationality: 'Canadian', years: 'b. 1956',
      tagline: 'Inventor of the lasso.',
      works: ['Lasso regression', 'The Elements of Statistical Learning', 'Significance analysis of microarrays'],
      techniques: ['Invented L1-penalised (lasso) regression for sparse models', 'Advanced the bootstrap and cross-validation', 'Co-authored two standard learning textbooks'],
    },

    // ── Modern Data Science
    {
      id: 'nightingale', name: 'Florence Nightingale', wikiSlug: 'Florence_Nightingale', hall: 'modern',
      role: 'Statistician & nurse', era: 'Victorian', nationality: 'British', years: '1820–1910',
      tagline: 'Pioneer of statistical graphics and public-health data.',
      works: ['Polar-area (rose) diagram', 'Mortality statistics of the Crimean War'],
      techniques: ['Used data visualisation to drive policy reform', 'Invented the polar-area diagram', 'First female fellow of the Royal Statistical Society'],
    },
    {
      id: 'cleveland', name: 'William S. Cleveland', wikiSlug: 'William_S._Cleveland', hall: 'modern',
      role: 'Statistician', era: 'Contemporary', nationality: 'American', years: 'b. 1943',
      tagline: 'Coined "data science" as a discipline; father of LOESS.',
      works: ['LOESS smoothing', 'The Elements of Graphing Data', '"Data Science: An Action Plan" (2001)'],
      techniques: ['Proposed data science as an independent discipline', 'Developed local regression (LOESS)', 'Advanced the science of statistical graphics'],
    },
  ],

  concepts: [
    { id: 'probability', name: 'Probability', blurb: 'The mathematics of uncertainty — assigning likelihoods to events and reasoning about randomness.', wikiSlug: 'Probability', tags: ['statistics', 'foundations'] },
    { id: 'distribution', name: 'Probability Distributions', blurb: 'Functions describing how likely each outcome is — normal, binomial, Poisson and beyond.', wikiSlug: 'Probability_distribution', tags: ['statistics'] },
    { id: 'regression', name: 'Regression', blurb: 'Modelling the relationship between variables to explain and predict continuous outcomes.', wikiSlug: 'Regression_analysis', tags: ['statistics', 'ml'] },
    { id: 'bayesian', name: 'Bayesian Inference', blurb: 'Updating a probability (the prior) into a posterior as new evidence arrives, via Bayes’ theorem.', wikiSlug: 'Bayesian_inference', tags: ['inference', 'bayes'] },
    { id: 'hypothesis-testing', name: 'Hypothesis Testing', blurb: 'A formal procedure for deciding whether data provide enough evidence to reject a null hypothesis.', wikiSlug: 'Statistical_hypothesis_test', tags: ['inference', 'statistics'] },
    { id: 'overfitting', name: 'Overfitting & Regularisation', blurb: 'When a model memorises noise instead of signal; regularisation and validation guard against it.', wikiSlug: 'Overfitting', tags: ['ml', 'modelling'] },
    { id: 'gradient-descent', name: 'Gradient Descent', blurb: 'An iterative optimiser that follows the slope of a loss function to fit model parameters.', wikiSlug: 'Gradient_descent', tags: ['ml', 'optimisation'] },
    { id: 'neural-network', name: 'Neural Networks', blurb: 'Layered function approximators trained on data to model complex nonlinear relationships.', wikiSlug: 'Artificial_neural_network', tags: ['ml', 'deep-learning'] },
    { id: 'cross-validation', name: 'Cross-Validation', blurb: 'Estimating out-of-sample performance by repeatedly training and testing on data splits.', wikiSlug: 'Cross-validation_(statistics)', tags: ['ml', 'evaluation'] },
    { id: 'feature-engineering', name: 'Feature Engineering', blurb: 'Transforming raw data into informative inputs — scaling, encoding, and constructing predictive variables.', wikiSlug: 'Feature_engineering', tags: ['ml', 'data-prep'] },
    { id: 'dimensionality-reduction', name: 'Dimensionality Reduction', blurb: 'Compressing many correlated variables into a few informative ones, e.g. with PCA.', wikiSlug: 'Dimensionality_reduction', tags: ['ml', 'statistics'] },
    { id: 'clustering', name: 'Clustering', blurb: 'Unsupervised grouping of data points by similarity — k-means, hierarchical and density-based methods.', wikiSlug: 'Cluster_analysis', tags: ['ml', 'unsupervised'] },
  ],

  eras: [
    {
      id: 'probability-origins', title: 'The Origins of Probability', span: '1650s–1800s',
      essay: 'Probability began with games of chance — Pascal and Fermat’s correspondence — and matured into a theory of uncertainty. Bayes framed how evidence updates belief, while Gauss and Laplace forged the normal distribution and least squares to tame observational error.',
      developments: ['Pascal–Fermat correspondence on chance', 'Bayes’ theorem (1763)', 'Least squares and the normal distribution', 'Laplace’s analytic probability'],
      turningPoints: ['Uncertainty becomes mathematically tractable', 'Errors modelled by the bell curve'],
    },
    {
      id: 'biometrics', title: 'Statistics Becomes a Science', span: '1880s–1930s',
      essay: 'Galton and Pearson turned statistics into a rigorous mathematical field, giving us correlation, regression and the chi-squared test. Fisher then built the modern edifice: maximum likelihood, significance testing and the randomised experiment.',
      developments: ['Correlation and regression (Galton)', 'Chi-squared test (Pearson)', 'Maximum likelihood and ANOVA (Fisher)', 'Design of experiments (1935)'],
      turningPoints: ['Correlation quantified', 'The randomised controlled experiment established'],
    },
    {
      id: 'inference', title: 'Inference & Decision', span: '1930s–1950s',
      essay: 'Neyman and Pearson formalised hypothesis testing and confidence intervals, and Wald founded decision theory and sequential analysis. Statistics gained a rigorous framework for making choices under uncertainty.',
      developments: ['Neyman–Pearson hypothesis testing', 'Confidence intervals', 'Wald’s decision theory', 'Sequential analysis'],
      turningPoints: ['Testing and estimation put on firm footing', 'Statistics framed as optimal decision-making'],
    },
    {
      id: 'computing', title: 'Computing & Exploration', span: '1960s–1980s',
      essay: 'Cheap computing changed statistics. Tukey championed exploratory data analysis and robust methods, the bootstrap freed inference from restrictive assumptions, and interactive graphics let analysts look at data before modelling it.',
      developments: ['Exploratory data analysis (Tukey)', 'The bootstrap (Efron, 1979)', 'Robust statistics', 'Statistical graphics'],
      turningPoints: ['Computation replaces analytic approximation', 'Looking at data becomes a first-class step'],
    },
    {
      id: 'learning', title: 'Statistical Learning', span: '1980s–2000s',
      essay: 'The machine-learning and statistics communities converged. CART, random forests and support vector machines delivered powerful predictive models, while statistical learning theory explained why and when they generalise.',
      developments: ['CART and random forests (Breiman)', 'Support vector machines (Vapnik)', 'Lasso and regularisation', 'The Elements of Statistical Learning (2001)'],
      turningPoints: ['Prediction accuracy becomes a central goal', 'Learning theory grounds generalisation'],
    },
    {
      id: 'big-data', title: 'Big Data & the Discipline', span: '2000s–2010s',
      essay: 'The web produced data at unprecedented scale. Cleveland’s call for a distinct "data science" was answered as pandas, R, Hadoop and cloud computing made large-scale analysis routine, and the data scientist emerged as a defined role.',
      developments: ['"Data science" named as a discipline', 'pandas, R and the tidyverse', 'MapReduce and distributed data', 'Kaggle competitions'],
      turningPoints: ['Data science recognised as its own field', 'Analysis scales to web-sized datasets'],
    },
    {
      id: 'ml-era', title: 'The Machine-Learning Era', span: '2010s–present',
      essay: 'Deep learning, GPUs and vast datasets pushed predictive modelling to new heights across vision, language and forecasting. Data science now spans experimentation, causal inference, MLOps and the responsible, interpretable use of powerful models.',
      developments: ['Deep learning at scale', 'AutoML and MLOps pipelines', 'Causal inference revival', 'Interpretability and fairness'],
      turningPoints: ['Models scale to billions of parameters', 'Focus shifts to reliability, causality and ethics'],
    },
  ],

  laws: [
    {
      id: 'bayes-theorem', category: 'Inference', name: 'Bayes’ Theorem',
      latex: 'P(A \\mid B) = \\dfrac{P(B \\mid A)\\, P(A)}{P(B)}',
      variables: [
        { sym: 'P(A\\mid B)', name: 'Posterior probability of A given B' },
        { sym: 'P(B\\mid A)', name: 'Likelihood of B given A' },
        { sym: 'P(A)', name: 'Prior probability of A' },
        { sym: 'P(B)', name: 'Evidence / marginal probability of B' },
      ],
      description: 'The rule for updating a prior belief into a posterior in light of new evidence — the engine of Bayesian inference.',
      reference: 'Bayes (1763)',
    },
    {
      id: 'normal-pdf', category: 'Distributions', name: 'Normal (Gaussian) Distribution',
      latex: 'f(x) = \\dfrac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x - \\mu)^2}{2\\sigma^2}}',
      variables: [
        { sym: '\\mu', name: 'Mean' },
        { sym: '\\sigma', name: 'Standard deviation' },
        { sym: 'x', name: 'Value of the variable' },
      ],
      description: 'The bell curve — the limiting distribution of sums of many independent errors and the backbone of classical inference.',
    },
    {
      id: 'clt', category: 'Inference', name: 'Central Limit Theorem',
      latex: '\\dfrac{\\bar{X}_n - \\mu}{\\sigma / \\sqrt{n}} \\xrightarrow{d} \\mathcal{N}(0, 1)',
      variables: [
        { sym: '\\bar{X}_n', name: 'Sample mean of n draws' },
        { sym: '\\mu', name: 'Population mean' },
        { sym: '\\sigma', name: 'Population standard deviation' },
        { sym: 'n', name: 'Sample size' },
      ],
      description: 'The standardised mean of many independent samples converges to a standard normal distribution, regardless of the source distribution.',
      reference: 'Laplace; Lyapunov',
    },
    {
      id: 'linear-regression', category: 'Modelling', name: 'Linear Regression',
      latex: '\\hat{y} = \\beta_0 + \\sum_{j=1}^{p} \\beta_j x_j',
      variables: [
        { sym: '\\hat{y}', name: 'Predicted response' },
        { sym: '\\beta_0', name: 'Intercept' },
        { sym: '\\beta_j', name: 'Coefficient for feature j' },
        { sym: 'x_j', name: 'Predictor variable j' },
      ],
      description: 'Models the response as a weighted sum of predictors; coefficients are the effect of each feature holding others fixed.',
    },
    {
      id: 'ols', category: 'Estimation', name: 'Ordinary Least Squares',
      latex: '\\hat{\\beta} = (X^{\\top} X)^{-1} X^{\\top} y',
      variables: [
        { sym: '\\hat{\\beta}', name: 'Estimated coefficient vector' },
        { sym: 'X', name: 'Design (feature) matrix' },
        { sym: 'y', name: 'Response vector' },
      ],
      description: 'The closed-form solution that minimises the sum of squared residuals in linear regression.',
      reference: 'Gauss; Legendre',
    },
    {
      id: 'logistic', category: 'Modelling', name: 'Logistic Regression',
      latex: 'P(y = 1 \\mid x) = \\dfrac{1}{1 + e^{-(\\beta_0 + \\beta^{\\top} x)}}',
      variables: [
        { sym: '\\beta_0', name: 'Intercept (log-odds bias)' },
        { sym: '\\beta', name: 'Coefficient vector' },
        { sym: 'x', name: 'Feature vector' },
      ],
      description: 'Maps a linear score through the logistic function to model the probability of a binary outcome.',
    },
    {
      id: 'gradient-descent', category: 'Optimisation', name: 'Gradient Descent Update',
      latex: '\\theta_{t+1} = \\theta_t - \\eta\\, \\nabla_\\theta J(\\theta_t)',
      variables: [
        { sym: '\\theta', name: 'Model parameters' },
        { sym: '\\eta', name: 'Learning rate' },
        { sym: '\\nabla_\\theta J', name: 'Gradient of the loss' },
      ],
      description: 'Iteratively steps parameters against the gradient of the loss to minimise prediction error.',
    },
    {
      id: 'mse', category: 'Estimation', name: 'Mean Squared Error',
      latex: '\\mathrm{MSE} = \\dfrac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2',
      variables: [
        { sym: 'y_i', name: 'Observed value' },
        { sym: '\\hat{y}_i', name: 'Predicted value' },
        { sym: 'n', name: 'Number of observations' },
      ],
      description: 'The average squared prediction error; the standard loss for regression and a key model-comparison metric.',
    },
    {
      id: 'bias-variance', category: 'Modelling', name: 'Bias–Variance Decomposition',
      latex: '\\mathbb{E}\\big[(y - \\hat{f})^2\\big] = \\mathrm{Bias}(\\hat{f})^2 + \\mathrm{Var}(\\hat{f}) + \\sigma^2',
      variables: [
        { sym: '\\hat{f}', name: 'Fitted model' },
        { sym: '\\sigma^2', name: 'Irreducible noise variance' },
      ],
      description: 'Expected error splits into bias (underfitting), variance (overfitting) and irreducible noise — the central trade-off in modelling.',
    },
    {
      id: 'entropy', category: 'Information', name: 'Shannon Entropy',
      latex: 'H(X) = -\\sum_i p_i \\log_2 p_i',
      variables: [
        { sym: 'H', name: 'Entropy', unit: 'bits' },
        { sym: 'p_i', name: 'Probability of outcome i' },
      ],
      description: 'The average uncertainty of a distribution; the basis of information gain used to split decision trees.',
    },
    {
      id: 'pearson-r', category: 'Correlation', name: 'Pearson Correlation Coefficient',
      latex: 'r = \\dfrac{\\sum_i (x_i - \\bar{x})(y_i - \\bar{y})}{\\sqrt{\\sum_i (x_i - \\bar{x})^2}\\,\\sqrt{\\sum_i (y_i - \\bar{y})^2}}',
      variables: [
        { sym: 'r', name: 'Correlation, in [-1, 1]' },
        { sym: 'x_i, y_i', name: 'Paired observations' },
        { sym: '\\bar{x}, \\bar{y}', name: 'Sample means' },
      ],
      description: 'Measures the strength and direction of the linear relationship between two variables.',
      reference: 'Pearson',
    },
    {
      id: 'bayes-optimal', category: 'Inference', name: 'Maximum Likelihood Estimation',
      latex: '\\hat{\\theta} = \\arg\\max_\\theta \\sum_{i=1}^{n} \\log p(x_i \\mid \\theta)',
      variables: [
        { sym: '\\hat{\\theta}', name: 'Estimated parameters' },
        { sym: 'p(x_i\\mid\\theta)', name: 'Likelihood of observation i' },
      ],
      description: 'Chooses the parameters that make the observed data most probable; the dominant estimation principle in statistics.',
      reference: 'Fisher',
    },
    {
      id: 'sigmoid', category: 'Machine Learning', name: 'Sigmoid Function',
      latex: '\\sigma(z) = \\dfrac{1}{1 + e^{-z}}',
      variables: [
        { sym: '\\sigma', name: 'Output in (0,1)' },
        { sym: 'z', name: 'Linear score (logit)' },
      ],
      description: 'The logistic squashing function linking log-odds to probability; used in logistic regression and neural activations.',
    },
    {
      id: 'softmax', category: 'Machine Learning', name: 'Softmax',
      latex: '\\mathrm{softmax}(z)_i = \\dfrac{e^{z_i}}{\\sum_j e^{z_j}}',
      variables: [
        { sym: 'z_i', name: 'Score for class i' },
        { sym: 'i, j', name: 'Class indices' },
      ],
      description: 'Normalises a vector of scores into a probability distribution over classes for multi-class prediction.',
    },
    {
      id: 'l2-regularisation', category: 'Modelling', name: 'Ridge (L2) Regularisation',
      latex: '\\hat{\\beta} = \\arg\\min_\\beta \\; \\lVert y - X\\beta \\rVert^2 + \\lambda \\lVert \\beta \\rVert_2^2',
      variables: [
        { sym: '\\lambda', name: 'Regularisation strength' },
        { sym: '\\beta', name: 'Coefficient vector' },
      ],
      description: 'Penalises large coefficients to reduce variance and overfitting; the L1 (lasso) variant instead induces sparsity.',
    },
    {
      id: 'bayes-factor', category: 'Inference', name: 'Odds Form of Bayes’ Rule',
      latex: '\\dfrac{P(H_1 \\mid D)}{P(H_2 \\mid D)} = \\dfrac{P(D \\mid H_1)}{P(D \\mid H_2)} \\cdot \\dfrac{P(H_1)}{P(H_2)}',
      variables: [
        { sym: 'H_1, H_2', name: 'Competing hypotheses' },
        { sym: 'D', name: 'Observed data' },
      ],
      description: 'Posterior odds equal the Bayes factor (likelihood ratio) times prior odds — how evidence shifts the balance between hypotheses.',
    },
  ],

  tools: [
    { name: 'Kaggle', org: 'Google', url: 'https://www.kaggle.com', desc: 'Datasets, competitions, notebooks and a community for practical data science.', kind: 'community', access: 'Free key' },
    { name: 'pandas', org: 'pandas / NumFOCUS', url: 'https://pandas.pydata.org', desc: 'The core Python library for tabular data manipulation and analysis.', kind: 'software', access: 'Open' },
    { name: 'NumPy', org: 'NumPy / NumFOCUS', url: 'https://numpy.org', desc: 'Fundamental array and numerical computing library for Python.', kind: 'software', access: 'Open' },
    { name: 'scikit-learn', org: 'scikit-learn', url: 'https://scikit-learn.org', desc: 'The reference open-source library for classical machine learning.', kind: 'software', access: 'Open' },
    { name: 'TensorFlow', org: 'Google', url: 'https://www.tensorflow.org', desc: 'End-to-end open-source platform for building and deploying ML models.', kind: 'software', access: 'Open' },
    { name: 'R Project', org: 'R Foundation', url: 'https://www.r-project.org', desc: 'Language and environment for statistical computing and graphics.', kind: 'software', access: 'Open' },
    { name: 'Google Colab', org: 'Google', url: 'https://colab.research.google.com', desc: 'Free cloud notebooks with GPU/TPU for data analysis and ML.', kind: 'software', access: 'Freemium' },
    { name: 'Jupyter', org: 'Project Jupyter', url: 'https://jupyter.org', desc: 'Interactive notebooks combining code, math, visualisation and narrative.', kind: 'software', access: 'Open' },
    { name: 'Observable', org: 'Observable', url: 'https://observablehq.com', desc: 'Reactive notebooks for interactive data visualisation with D3.', kind: 'software', access: 'Freemium' },
    { name: 'Papers With Code', org: 'Papers With Code', url: 'https://paperswithcode.com', desc: 'ML papers linked to open implementations and state-of-the-art benchmarks.', kind: 'community', access: 'Open' },
    { name: 'Our World in Data', org: 'Global Change Data Lab', url: 'https://ourworldindata.org', desc: 'Open, well-documented datasets and visualisations on global development.', kind: 'dataset', access: 'Open' },
    { name: 'Hugging Face Datasets', org: 'Hugging Face', url: 'https://huggingface.co/datasets', desc: 'Thousands of open, ready-to-load datasets for machine learning.', kind: 'dataset', access: 'Freemium' },
    { name: 'UCI ML Repository', org: 'UC Irvine', url: 'https://archive.ics.uci.edu', desc: 'Classic curated benchmark datasets for machine-learning research.', kind: 'dataset', access: 'Open' },
    { name: 'Plotly', org: 'Plotly', url: 'https://plotly.com/python/', desc: 'Open-source interactive graphing library for Python, R and JavaScript.', kind: 'software', access: 'Open' },
  ],
};

export default DATA;
