/** MirrorNet Poster Telegram Bot */

import Reddit from "./posters/reddit";

// const x = new X();
const reddit = new Reddit();

/** The main entry point to start all the posters asynchronously */
async function main() {
    // x.start().catch(
    //     error => console.error(error.message)
    // );
    reddit.start().catch(
        error => console.error(error.message)
    );
}

main();