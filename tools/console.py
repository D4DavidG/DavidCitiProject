"""Open the AWS web console, signed in with the workshop's temporary credentials.

The workshop hands out access keys, not a console password. AWS lets keys from an
assumed role be swapped for a one-off console sign-in link, which is what this does.

    (set -a; source ENVIRONMENT.config; python3 tools/console.py)          # the Lambda
    (set -a; source ENVIRONMENT.config; python3 tools/console.py logs)     # its logs

Pages: lambda (default), logs, rds, cloudfront, s3. The link opens in your browser.
It signs you in, so never paste it anywhere; it stops working after 15 minutes.
If credentials have expired, run ./bin/setup-participant.sh first. A page that says
"access denied" is a service the workshop role isn't allowed to see.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
import webbrowser

REGION = os.getenv("AWS_REGION", "us-east-2")
if REGION == "us-east-1":  # LocalStack's region; the real deployment is in us-east-2
    REGION = "us-east-2"
FUNCTION = f"coding-workshop-tracker-{os.getenv('PARTICIPANT_ID', '')}"
CONSOLE = f"https://{REGION}.console.aws.amazon.com"
PAGES = {
    "lambda": f"{CONSOLE}/lambda/home?region={REGION}#/functions/{FUNCTION}",
    "logs": f"{CONSOLE}/cloudwatch/home?region={REGION}#logsV2:log-groups/log-group/"
            + urllib.parse.quote(urllib.parse.quote(f"/aws/lambda/{FUNCTION}", safe=""), safe="").replace("%", "$"),
    "rds": f"{CONSOLE}/rds/home?region={REGION}#databases:",
    "cloudfront": "https://console.aws.amazon.com/cloudfront/v4/home#/distributions",
    "s3": f"https://s3.console.aws.amazon.com/s3/buckets?region={REGION}",
}


def sign_in_link(destination: str) -> str:
    """Trade the temporary keys for a console sign-in link to `destination`."""
    try:
        session = json.dumps({"sessionId": os.environ["AWS_ACCESS_KEY_ID"],
                              "sessionKey": os.environ["AWS_SECRET_ACCESS_KEY"],
                              "sessionToken": os.environ["AWS_SESSION_TOKEN"]})
    except KeyError:
        sys.exit("No AWS credentials loaded. Run: (set -a; source ENVIRONMENT.config; python3 tools/console.py)")
    federation = "https://signin.aws.amazon.com/federation"
    query = urllib.parse.urlencode({"Action": "getSigninToken", "Session": session})
    try:
        with urllib.request.urlopen(f"{federation}?{query}", timeout=20) as response:  # nosec B310: fixed https URL
            token = json.load(response)["SigninToken"]
    except Exception as exc:  # expired keys answer 400
        sys.exit(f"AWS refused the credentials ({exc}). Run ./bin/setup-participant.sh, then try again.")
    return f"{federation}?" + urllib.parse.urlencode(
        {"Action": "login", "Issuer": "coding-workshop", "Destination": destination, "SigninToken": token})


def main() -> None:
    page = sys.argv[1] if len(sys.argv) > 1 else "lambda"
    if page not in PAGES:
        sys.exit(f"Unknown page {page!r}. Choose one of: {', '.join(PAGES)}")
    link = sign_in_link(PAGES[page])
    if webbrowser.open(link):
        print(f"Opened the AWS console ({page}) in your browser. The link expires in 15 minutes.")
    else:
        print("Couldn't open a browser. Paste this link into one (it signs you in; don't share it):")
        print(link)


if __name__ == "__main__":
    main()
