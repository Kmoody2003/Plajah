import React from 'react';
import PostmanApp from './postman/PostmanApp';

/**
 * The Post Man — full-page view (AppView 'POSTMAN').
 *
 * This used to be an <iframe> pointed at an AI Studio Cloud Run deployment. That
 * arrangement could not read the Plajah session — it stored every user's Gmail
 * tokens under a single Firestore document named `default_user` — kept a Gemini
 * API key in its client bundle, and would have gone blank the day the dev
 * deployment was retired. The app is native now; see components/postman/.
 */
const PostmanView: React.FC = () => <PostmanApp />;

export default PostmanView;
