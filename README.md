# BiteZone Counter

This is the counter for a restaurant computer. Orders are saved on that computer. The internet is only needed when someone presses **Sync**.

This laptop is for building the app. Each restaurant computer runs its own copy. Shutting that computer down does not delete its orders or its saved customer names.

## Windows computer, first time

The restaurant PC does not need Node installed beforehand. Open **Command Prompt** and paste this. It installs Git and Node, downloads this project, and builds the counter.

```bat
winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"
cd /d %USERPROFILE%\Desktop
git clone https://github.com/husnainalyy/bitezone-crm-offline.git
cd bitezone-crm-offline
npm install
npm run build
```

When that finishes, put **BiteZone Counter** on the Desktop:

```bat
cd /d %USERPROFILE%\Desktop\bitezone-crm-offline
"Make Desktop Icon.bat"
```

That icon opens the offline counter. The next day, double-click **BiteZone Counter** on the Desktop. Do not run `npm` again.

## Put it on a restaurant computer, one time

1. Copy the `bite-zone-crm-desktop` folder onto that computer.
2. Install Node.js once, then in that folder run:

```bash
npm install
npm run build
```

3. On a Mac, double-click **BiteZone Counter**. On Windows, double-click **Make Desktop Icon**, then use the **BiteZone Counter** icon it places on the Desktop.
4. Open **Online sync** once. Enter the website address, key, admin email, and admin password from the online BiteZone CRM. Press **Save**.
5. Press **Sync** while the internet is on. The menu, tables, and customer names download onto this computer.

`npm install` and `npm run build` happen once, when the computer is set up. They are not part of a normal day.

## After shutdown

Double-click **BiteZone Counter**. Do not open a terminal. Do not run `npm`. Orders and customer names are still on the computer.

## A normal day

1. Double-click BiteZone Counter. It opens on **New order**.
2. Take dine-in, takeaway, or delivery orders. They are saved immediately, even with no internet.
3. For takeaway or delivery, start typing the customer name or phone. Names already on this computer appear. Click one to fill the name, phone, and address.
4. A new customer is saved on this computer as soon as the order is placed. That name appears on the next order here, before the next Sync.
5. When the internet is on, press **Sync**. That sends unsent orders and brings in customer names, the menu, and tables from the online CRM, including names from earlier days and from other counters.
6. After shutdown, open the app again. Orders and customer names are still there. Press **Sync** again when you want the latest names.
