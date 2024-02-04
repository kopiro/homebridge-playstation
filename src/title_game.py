import json
import sys

from psnawp_api import PSNAWP

psnawp = PSNAWP(sys.argv[1])
client = psnawp.me()


def user_status():
    accounts_id = sys.argv
    del accounts_id[0:2]
    accounts_id = accounts_id[0].replace('["', '').replace('"]', '').replace('"', '')
    accounts_ids = accounts_id.split(',')

    game_id = "CUSAXXXXXX"
    game_title = "Not playing"
    for user in accounts_ids:
        user_name = psnawp.user(account_id=user).account_id
        user_info = psnawp.user(account_id=user).get_presence()
        if user_info["basicPresence"]["primaryPlatformInfo"]["onlineStatus"] == "online" and user == user_name:
            game_id = user_info["basicPresence"]["gameTitleInfoList"][0]["npTitleId"]
            game_title = user_info["basicPresence"]["gameTitleInfoList"][0]["titleName"]

    return game_title


print(user_status())