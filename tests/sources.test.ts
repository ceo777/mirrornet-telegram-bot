import { RedditChannel, RedditPushshiftAPI } from '../src/sources/reddit-pushshift-api';

/** */
describe('Sources testing', () => {
    test('Reddit PushShift API', async () => {
        const channel: RedditChannel = {
            id: 1,
            enabled: true,
            name: 'MirrorNet Test',
            telegram: '-1002033699352',
            subreddit: 'memes'
        };
        const redditPushshiftAPI = new RedditPushshiftAPI(channel);

        await redditPushshiftAPI.importData()
            /** we expect some posts to be successfully imported from PushShift */
            .then(posts => {
                expect(posts[0].id).not.toBeUndefined();
            })
            /** if posts are not imported, we expect that this is only due to restricted access */
            .catch(error => {
                expect(error.message).toEqual('Reddit PushShift API Error. Status code: 403. Not authenticated'
                    || 'Reddit PushShift API Error. Status code: 403. The user is not an approved moderator on Reddit.'
                    || 'Reddit PushShift API Error. Status code: 403. Failed to validate the reddit user as an approved moderator.');
            });
    });
});