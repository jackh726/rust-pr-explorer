
export const fetchIssues = async (token: string, signal: AbortSignal) => {
    let page = 1;
    const issues = [];
    while (true) {
        const response = await fetch(`https://api.github.com/repos/rust-lang/rust/pulls?per_page=100&page=${page}`, {
            headers: new Headers({
                'Authorization': `token ${token}`,
            }),
            signal,
        });
        const fetched = await response.json();
        if (!Array.isArray(fetched)) {
            throw Error(`Not array ${JSON.stringify(fetched)}`)
        }
        issues.push(...fetched);
        if (fetched.length < 100) {
            break;
        }
        if (page > 10) {
            break;
        }
        page += 1;
    }
    return issues;
};
