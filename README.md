# Foodcourt
Server API's can be used to handle cart transactions, receive food orders, schedule orders for future, get food menu. Application can be further enhanced to support payments.

# Features!
  - Digital queue management with auto-generated ticket IDs & queue numbers
  - Student cart & order placement with estimated pickup times
  - Special menu curation (mark food as special/available, schedule pickup windows)
  - Mess admin menu & user management surfaces (new admin console for staff creation + menu curation)
  - Kitchen queue board (`GET /api/queue`) to track pending orders in FIFO order
  - Order status workflow with transition API (`PATCH /api/order/:id/status`)
  - Ticket tracking / verification APIs (`GET /api/order/ticket/:ticketId`)
  - Feedback capture & historical order retrieval
  - Supports NoSQL Database


### Tech

Application uses a number of open source projects to work properly:

* [node.js] - evented I/O for the backend
* [Express] - fast node.js network app framework
* [MongoDB] - A NoSQL database

### Installation

Application requires [Node.js](https://nodejs.org/) v4+ to run.

Setup database and provide database configuration in ``foodcourt/config/config.json``
```sh
        "MONGODB_URI": "mongodb://localhost:27017/hunar?authSource=admin",
        "MONGODB_USER": "admin",
        "MONGODB_PASS": "password"
```
Install the dependencies and devDependencies and start the server.

```sh
$ npm install -d
$ node app
```

### Core API surfaces

| Audience        | Endpoint                                    | Description |
|-----------------|----------------------------------------------|-------------|
| Students        | `POST /api/order/create`                     | Places an order using the session cart and generates ticket/queue data. Requires `customer` payload (messId, name, rollNumber). |
| Students        | `GET /api/order/ticket/:ticketId`            | Returns live status, queue number, notification log, and ETA for a ticket. |
| Mess Admin      | `POST /api/food-item`, `PUT /api/food-item/:id` | Manage food catalogue, mark items as special/available, set pickup windows, tags, etc. |
| Mess Admin      | `POST /api/menu`, `PUT /api/menu/:name`      | Curate menus by type (Daily/Special/Seasonal), toggle availability windows. |
| Mess Admin      | `GET/POST/PATCH/DELETE /api/users`           | Provision staff/admin/student accounts, update roles, remove access. |
| Kitchen Staff   | `GET /api/queue`                             | Sorted view of queued/preparing/ready orders to process in FIFO order. |
| Kitchen Staff   | `PATCH /api/order/:id/status`                | Move orders through `Queued -> Preparing -> Ready -> Collected` or cancel with validation. |
| Students/Admins | `PATCH /api/order/:id/cancel`                | Cancels queued/preparing orders (adds audit trail). |

All responses are JSON. Refer to `routes/index.router.js` for the complete list. Use the `/api/test` route to ensure connectivity before integrating a client.

### Frontend companion (MessMate UI)

A React + TypeScript client lives in `messmate-frontend/`. It consumes the APIs above and implements the user flows from the PDF (menu browsing, cart checkout, ticket tracking, kitchen dashboard).

```sh
cd messmate-frontend
npm install
# configure backend URL if needed in .env.development
npm start        # launches http://localhost:3000
```

The backend must be running on `http://localhost:3000` (or adjust `REACT_APP_API_URL`). CORS is enabled via `CLIENT_URL` so the two apps can communicate with cookies/sessions.

### Authentication & Roles

The API now enforces role-based access:

| Role | Capabilities |
|------|--------------|
| `student` | Browse menu, manage personal cart, place/cancel their own orders, track tickets. |
| `staff` | View live queue board, update order statuses, cancel orders. |
| `admin` | All staff privileges plus manage menu/items and user accounts. |

Create seed accounts (executed once, after MongoDB is running):

```sh
cd foodcourt
node scripts/seedUsers.js
```

Seed sample menu items (optional, helpful for demos):

```sh
cd foodcourt
node scripts/seedMenuItems.js
```

This provisions sample users:

| Role | Identifier | Password |
|------|------------|----------|
| Admin | `admin001` | `Admin@123` |
| Kitchen Staff | `kitchen001` | `Kitchen@123` |
| Student | `MM-1023` | `Student@123` |

Students may also self-register via `POST /api/auth/register` (the React UI exposes this flow under the *Student Login* tab). For staff/admin accounts, either seed via the script above or insert records manually.



[//]: # (These are reference links used in the body of this note and get stripped out when the markdown processor does its job. There is no need to format nicely because it shouldn't be seen. Thanks SO - http://stackoverflow.com/questions/4823468/store-comments-in-markdown-syntax)


   [dill]: <https://github.com/joemccann/dillinger>
   [git-repo-url]: <https://github.com/joemccann/dillinger.git>
   [john gruber]: <http://daringfireball.net>
   [df1]: <http://daringfireball.net/projects/markdown/>
   [markdown-it]: <https://github.com/markdown-it/markdown-it>
   [Ace Editor]: <http://ace.ajax.org>
   [node.js]: <http://nodejs.org>
   [Twitter Bootstrap]: <http://twitter.github.com/bootstrap/>
   [jQuery]: <http://jquery.com>
   [Angular Material Design]: <https://material.angular.io/>
   [express]: <http://expressjs.com>
   [Angular]: <https://angular.io/>
   [MongoDB]: <https://www.mongodb.com/>

   [PlDb]: <https://github.com/joemccann/dillinger/tree/master/plugins/dropbox/README.md>
   [PlGh]: <https://github.com/joemccann/dillinger/tree/master/plugins/github/README.md>
   [PlGd]: <https://github.com/joemccann/dillinger/tree/master/plugins/googledrive/README.md>
   [PlOd]: <https://github.com/joemccann/dillinger/tree/master/plugins/onedrive/README.md>
   [PlMe]: <https://github.com/joemccann/dillinger/tree/master/plugins/medium/README.md>
   [PlGa]: <https://github.com/RahulHP/dillinger/blob/master/plugins/googleanalytics/README.md>
