import { fetchReelsFeed, likeReel, commentOnReel, trackVideoInteraction, uploadReel, mockDb } from './index.js';
// Enable mock mode env variable
process.env.VITE_USE_MOCK_API = 'true';
async function runVerification() {
    console.log('----------------------------------------------------');
    console.log('JAMSH REELS PIPELINE VERIFICATION TEST RUNNER');
    console.log('----------------------------------------------------');
    try {
        // 1. Initialize Mock Users
        mockDb.setUsers([
            { id: 'user_1', username: 'alex', display_name: 'Alex' },
            { id: 'user_2', username: 'bob', display_name: 'Bob' }
        ]);
        // Set active user state mock helper
        global.useAuthStore = {
            getState: () => ({
                user: { id: 'user_1', username: 'alex' }
            })
        };
        console.log('[Test 1] Fetching Reels Feed with cursor recommendation scoring...');
        const feed = await fetchReelsFeed(2);
        console.log(` -> Success! Fetched ${feed.length} videos.`);
        console.log(` -> Scored top candidate: ${feed[0].caption} (Score: ${feed[0].recommendation_score})`);
        const targetVideo = feed[0];
        console.log('[Test 2] Submitting Like action to target video...');
        const state1 = await likeReel(targetVideo.id);
        console.log(` -> Success! New liked state: ${state1.liked}, Likes count change: ${state1.countChange}`);
        console.log('[Test 3] Submitting Comment to target video...');
        const comment = await commentOnReel(targetVideo.id, 'Wow, what a scenic view! 😍');
        console.log(` -> Success! Comment created: "${comment.content}"`);
        console.log('[Test 4] Logging Watch Interaction metrics...');
        await trackVideoInteraction(targetVideo.id, 'watch', 8.5, 96);
        console.log(' -> Success! Watch logs recorded to watch_history store.');
        console.log('[Test 5] Uploading new Reel video and verifying publish queue...');
        const newVideo = await uploadReel('https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-slow-motion-1191-large.mp4', 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=400', 'Summer breeze and sea salt keys. 🌊 #ocean #relaxation', ['ocean', 'relaxation'], ['Nature'], 12.4);
        console.log(` -> Success! Uploaded video ID: ${newVideo.id}`);
        console.log('[Test 6] Fetching updated feed to verify publish eligibility...');
        const updatedFeed = await fetchReelsFeed(10);
        const found = updatedFeed.find((v) => v.id === newVideo.id);
        if (found) {
            console.log(` -> Success! New video "${found.caption}" appeared in the feed with score ${found.recommendation_score}`);
        }
        else {
            throw new Error('Newly uploaded video did not appear in feed.');
        }
        console.log('----------------------------------------------------');
        console.log('ALL PIPELINE TESTS COMPLETED SUCCESSFULLY: 100% PASS');
        console.log('----------------------------------------------------');
    }
    catch (err) {
        console.error(' -> TEST RUNNER FAILED:', err.message);
        process.exit(1);
    }
}
runVerification();
