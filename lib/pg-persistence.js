const bcrypt = require("bcrypt");
const { dbQuery } = require("./db-query");

const saltRounds = 10;

module.exports = class PgPersistence {
  constructor(session) {
    this.teacher_id = session.teacher_id;
  }

  async authenticate({ email, password, session }) {
    const FIND_HASHED_PASSWORD =
      "SELECT password FROM users WHERE email = $1 AND password = $2";

    const hash = await bcrypt.hash(password, saltRounds);
    let result = await dbQuery(FIND_HASHED_PASSWORD, email, hash);
    const isAuthenticated = result.rowCount === 1;

    if (isAuthenticated) {
      session.teacher_id = result.rows[0].id;
    }

    return isAuthenticated;
  }

  async createUser({ email, password }) {
    const SQL = "INSERT INTO users (email, password) VALUES ($1, $2)";

    const hash = await bcrypt.hash(password, saltRounds);

    const result = await dbQuery(SQL, email, hash);
    return result.rowCount > 0;
  }

  async existsUser({ email, password }) {
    const hash = await bcrypt.hash(password, saltRounds);
    const SQL = "SELECT * FROM users WHERE email = $1 AND password = $2";

    const result = await dbQuery(SQL, email, hash);
    return result.rowCount > 0;
  }

  // Returns a promise that resolves to a sorted list of all the card lists
  // together with their cards. The list is sorted by completion status and
  // title (case-insensitive). The cards in the list are unsorted.
  async sortedCourses() {
    const ALL_COURSES = "SELECT * FROM courses" + "  ORDER BY created_at ASC";

    let resultDecks = dbQuery(ALL_COURSES, this.teacher_id);

    if (!resultDecks) return undefined;

    return resultDecks;
  }

  // Returns a new list of card lists partitioned by completion status.
  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];

    todoLists.forEach((deck) => {
      if (this.isDoneTodoList(deck)) {
        done.push(deck);
      } else {
        undone.push(deck);
      }
    });

    return undone.concat(done);
  }

  // Mark all cards on the card list as done. Returns `true` on success,
  // `false` if the card list doesn't exist. The card list ID must be numeric.
  async completeAllTodos(todoListId) {
    const SQL =
      "UPDATE cards SET done = TRUE WHERE NOT done AND deck_id = $1 AND teacher_id = $2";

    const result = await dbQuery(SQL, todoListId, this.teacher_id);
    return result.rowCount > 0;
  }

  // Create a new card list with the specified title and add it to the list of
  // card lists. Returns `true` on success, `false` on failure. (At this time,
  // there are no known failure conditions.)
  async createCourse(title) {
    const SQL = "INSERT INTO flashcards (title, teacher_id) VALUES ($1, $2)";

    const result = await dbQuery(SQL, title, this.teacher_id);
    return result.rowCount > 0;
  }

  // Create a new card with the specified title and add it to the indicated card
  // list. Returns `true` on success, `false` on failure.
  async createCard(todoListId, title) {
    const SQL =
      "INSERT INTO cards (title, deck_id, teacher_id) VALUES ($1, $2, $3)";

    const result = await dbQuery(SQL, title, todoListId, this.teacher_id);
    return result.rowCount > 0;
  }

  // Delete a card list from the list of card lists. Returns `true` on success,
  // `false` if the card list doesn't exist. The ID argument must be numeric.
  async deleteTodoList(todoListId) {
    const SQL = "DELETE FROM flashcards WHERE id = $1 AND teacher_id = $2";

    const result = await dbQuery(SQL, todoListId, this.teacher_id);
    return result.rowCount > 0;
  }

  // Delete the specified card from the specified card list. Returns `true` on
  // success, `false` if the card or card list doesn't exist. The id arguments
  // must both be numeric.
  async deleteTodo(todoListId, todoId) {
    const SQL =
      "DELETE FROM cards WHERE deck_id = $1 AND id = $2 AND teacher_id = $3";

    const result = await dbQuery(SQL, todoListId, todoId, this.teacher_id);
    return result.rowCount > 0;
  }

  // Does the card list have any undone cards? Returns true if yes, false if no.
  hasUndoneTodos(deck) {
    return deck.cards.some((card) => !card.done);
  }

  // Are all of the cards in the card list done? If the card list has at least
  // one card and all of its cards are marked as done, then the card list is
  // done. Otherwise, it is undone.
  isDoneTodoList(deck) {
    return deck.cards.length > 0 && deck.cards.every((card) => card.done);
  }

  // Returns `true` if a card list with the specified title exists in the list
  // of card lists, `false` otherwise.
  async existsTodoListTitle(title) {
    const SQL = "SELECT * FROM flashcards WHERE title = $1 AND teacher_id = $2";

    const result = await dbQuery(SQL, title, this.teacher_id);
    return result.rowCount > 0;
  }

  // Returns a copy of the card list with the indicated ID. Returns `undefined`
  // if not found. Note that `todoListId` must be numeric.
  async loadTodoList(todoListId) {
    const FIND_TODOLIST =
      "SELECT * FROM flashcards WHERE id = $1 AND teacher_id = $2";
    const FIND_TODOS =
      "SELECT * FROM cards WHERE deck_id = $1 AND teacher_id = $2";

    let resultTodoList = dbQuery(FIND_TODOLIST, todoListId, this.teacher_id);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.teacher_id);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);

    let deck = resultBoth[0].rows[0];
    if (!deck) return undefined;

    deck.cards = resultBoth[1].rows;
    return deck;
  }

  // Returns a copy of the indicated card in the indicated card list. Returns
  // `undefined` if either the card list or the card is not found. Note that
  // both IDs must be numeric.
  async loadTodo(todoListId, todoId) {
    const SQL =
      "SELECT * FROM cards WHERE deck_id = $1 AND id = $2 AND teacher_id = $3";

    const result = await dbQuery(SQL, todoListId, todoId, this.teacher_id);
    return result.rows[0];
  }

  // Set a new title for the specified card list. Returns `true` on success,
  // `false` if the card list isn't found. The card list ID must be numeric.
  async setTodoListTitle(todoListId, title) {
    const SQL =
      "UPDATE flashcards SET title = $1 WHERE id = $2 AND teacher_id = $3";

    const result = await dbQuery(SQL, title, todoListId, this.teacher_id);
    return result.rowCount > 0;
  }

  // Returns a promise that resolves to a sorted list of all the cards in the
  // specified card list. The list is sorted by completion status and title
  // (case-insensitive).
  async sortedTodos(deck) {
    const SORTED_TODOS =
      "SELECT * FROM cards" +
      "  WHERE deck_id = $1 AND teacher_id = $2" +
      "  ORDER BY done ASC, lower(title) ASC";

    let result = await dbQuery(SORTED_TODOS, deck.id, this.teacher_id);
    return result.rows;
  }

  // Toggle a card between the done and not done state. Returns `true` on
  // success, `false` if the card or card list doesn't exist. The id arguments
  // must both be numeric.
  async toggleDoneTodo(todoListId, todoId) {
    const SQL =
      "UPDATE cards SET done = NOT done WHERE id = $1 AND deck_id = $2 AND teacher_id = $3";
    const result = await dbQuery(SQL, todoId, todoListId, this.teacher_id);
    return result.rowCount > 0;
  }
};
