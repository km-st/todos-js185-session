const bcrypt = require("bcrypt");
const { dbQuery } = require("./db-query");

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
  }

  async authenticate({ username, password }) {
    const FIND_HASHED_PASSWORD =
      "SELECT password FROM users" + "  WHERE username = $1";

    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

  async createUser({ username, password }) {
    const SQL = "INSERT INTO users (username, password) VALUES ($1, $2)";

    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    const result = await dbQuery(SQL, username, hash);
    return result.rowCount > 0;
  }

  async existsUser(username) {
    const SQL = "SELECT * FROM users WHERE username = $1";

    const result = await dbQuery(SQL, username);
    return result.rowCount > 0;
  }

  // Returns a promise that resolves to a sorted list of all the todo lists
  // together with their todos. The list is sorted by completion status and
  // title (case-insensitive). The todos in the list are unsorted.
  async sortedTodoLists() {
    const ALL_TODOLISTS =
      "SELECT * FROM todolists" +
      "  WHERE username = $1" +
      "  ORDER BY lower(title) ASC";
    const ALL_TODOS = "SELECT * FROM todos" + "  WHERE username = $1";

    let resultTodoLists = dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(ALL_TODOS, this.username);
    let resultBoth = await Promise.all([resultTodoLists, resultTodos]);

    let allTodoLists = resultBoth[0].rows;
    let allTodos = resultBoth[1].rows;
    if (!allTodoLists || !allTodos) return undefined;

    allTodoLists.forEach((todoList) => {
      todoList.todos = allTodos.filter((todo) => {
        return todoList.id === todo.todolist_id;
      });
    });

    return this._partitionTodoLists(allTodoLists);
  }

  // Returns a new list of todo lists partitioned by completion status.
  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];

    todoLists.forEach((todoList) => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });

    return undone.concat(done);
  }

  // Mark all todos on the todo list as done. Returns `true` on success,
  // `false` if the todo list doesn't exist. The todo list ID must be numeric.
  async completeAllTodos(todoListId) {
    const SQL =
      "UPDATE todos SET done = TRUE WHERE NOT done AND todolist_id = $1 AND username = $2";

    const result = await dbQuery(SQL, todoListId, this.username);
    return result.rowCount > 0;
  }

  // Create a new todo list with the specified title and add it to the list of
  // todo lists. Returns `true` on success, `false` on failure. (At this time,
  // there are no known failure conditions.)
  async createTodoList(title) {
    const SQL = "INSERT INTO todolists (title, username) VALUES ($1, $2)";

    const result = await dbQuery(SQL, title, this.username);
    return result.rowCount > 0;
  }

  // Create a new todo with the specified title and add it to the indicated todo
  // list. Returns `true` on success, `false` on failure.
  async createTodo(todoListId, title) {
    const SQL =
      "INSERT INTO todos (title, todolist_id, username) VALUES ($1, $2, $3)";

    const result = await dbQuery(SQL, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  // Delete a todo list from the list of todo lists. Returns `true` on success,
  // `false` if the todo list doesn't exist. The ID argument must be numeric.
  async deleteTodoList(todoListId) {
    const SQL = "DELETE FROM todolists WHERE id = $1 AND username = $2";

    const result = await dbQuery(SQL, todoListId, this.username);
    return result.rowCount > 0;
  }

  // Delete the specified todo from the specified todo list. Returns `true` on
  // success, `false` if the todo or todo list doesn't exist. The id arguments
  // must both be numeric.
  async deleteTodo(todoListId, todoId) {
    const SQL =
      "DELETE FROM todos WHERE todolist_id = $1 AND id = $2 AND username = $3";

    const result = await dbQuery(SQL, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  // Does the todo list have any undone todos? Returns true if yes, false if no.
  hasUndoneTodos(todoList) {
    return todoList.todos.some((todo) => !todo.done);
  }

  // Are all of the todos in the todo list done? If the todo list has at least
  // one todo and all of its todos are marked as done, then the todo list is
  // done. Otherwise, it is undone.
  isDoneTodoList(todoList) {
    return (
      todoList.todos.length > 0 && todoList.todos.every((todo) => todo.done)
    );
  }

  // Returns `true` if a todo list with the specified title exists in the list
  // of todo lists, `false` otherwise.
  async existsTodoListTitle(title) {
    const SQL = "SELECT * FROM todolists WHERE title = $1 AND username = $2";

    const result = await dbQuery(SQL, title, this.username);
    return result.rowCount > 0;
  }

  // Returns a copy of the todo list with the indicated ID. Returns `undefined`
  // if not found. Note that `todoListId` must be numeric.
  async loadTodoList(todoListId) {
    const FIND_TODOLIST =
      "SELECT * FROM todolists WHERE id = $1 AND username = $2";
    const FIND_TODOS =
      "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2";

    let resultTodoList = dbQuery(FIND_TODOLIST, todoListId, this.username);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);

    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined;

    todoList.todos = resultBoth[1].rows;
    return todoList;
  }

  // Returns a copy of the indicated todo in the indicated todo list. Returns
  // `undefined` if either the todo list or the todo is not found. Note that
  // both IDs must be numeric.
  async loadTodo(todoListId, todoId) {
    const SQL =
      "SELECT * FROM todos WHERE todolist_id = $1 AND id = $2 AND username = $3";

    const result = await dbQuery(SQL, todoListId, todoId, this.username);
    return result.rows[0];
  }

  // Set a new title for the specified todo list. Returns `true` on success,
  // `false` if the todo list isn't found. The todo list ID must be numeric.
  async setTodoListTitle(todoListId, title) {
    const SQL =
      "UPDATE todolists SET title = $1 WHERE id = $2 AND username = $3";

    const result = await dbQuery(SQL, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  // Returns a promise that resolves to a sorted list of all the todos in the
  // specified todo list. The list is sorted by completion status and title
  // (case-insensitive).
  async sortedTodos(todoList) {
    const SORTED_TODOS =
      "SELECT * FROM todos" +
      "  WHERE todolist_id = $1 AND username = $2" +
      "  ORDER BY done ASC, lower(title) ASC";

    let result = await dbQuery(SORTED_TODOS, todoList.id, this.username);
    return result.rows;
  }

  // Toggle a todo between the done and not done state. Returns `true` on
  // success, `false` if the todo or todo list doesn't exist. The id arguments
  // must both be numeric.
  async toggleDoneTodo(todoListId, todoId) {
    const SQL =
      "UPDATE todos SET done = NOT done WHERE id = $1 AND todolist_id = $2 AND username = $3";
    const result = await dbQuery(SQL, todoId, todoListId, this.username);
    return result.rowCount > 0;
  }
};
