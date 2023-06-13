const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");
const config = require("./lib/config");

const app = express();
const host = config.HOST;
const port = config.PORT;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    cookie: {
      httpOnly: true,
      maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
      path: "/",
      secure: false,
    },
    name: "learn-session-id",
    resave: false,
    saveUninitialized: true,
    secret: process.env.SECRET,
    store: new LokiStore({}),
  })
);

app.use(flash());

const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    res.redirect(302, "/signin");
  } else {
    next();
  }
};

// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.user_id = req.session.user_id;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

app.post("/signout", (req, res) => {
  delete req.session.user_id;
  delete req.session.signedIn;

  res.redirect("/signin");
});

// Redirect start page
app.get("/", (req, res) => {
  console.log("redirecting to /courses");
  res.redirect("/courses");
});

// Render the course of todo courses
app.get(
  "/courses",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let store = res.locals.store;
    let courses = await store.sortedCourses();

    console.log("courses", courses);

    res.render("courses", {
      courses,
    });
  })
);

// Render new course page
app.get("/courses/new", (req, res) => {
  requiresAuthentication, res.render("new-course");
});

// Create a new todo course
app.post(
  "/courses",
  requiresAuthentication,
  [
    body("courseTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The course title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let errors = validationResult(req);
    let courseTitle = req.body.courseTitle;

    const rerenderNewCourse = () => {
      res.render("new-course", {
        courseTitle,
        flash: req.flash(),
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach((message) => req.flash("error", message.msg));
      rerenderNewCourse();
    } else if (await res.locals.store.existsCourseTitle(courseTitle)) {
      req.flash("error", "The course title must be unique.");
      rerenderNewCourse();
    } else {
      let created = await res.locals.store.createcourse(courseTitle);
      if (!created) {
        next(new Error("Failed to create todo course."));
      } else {
        req.flash("success", "The todo course has been created.");
        res.redirect("/courses");
      }
    }
  })
);

// Create a new flashcard course
app.post(
  "/courses/new",
  requiresAuthentication,
  [
    body("courseTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The course title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let errors = validationResult(req);
    let courseTitle = req.body.courseTitle;

    const rerenderNewCourse = () => {
      res.render("new-course", {
        courseTitle,
        flash: req.flash(),
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach((message) => req.flash("error", message.msg));
      rerenderNewCourse();
    } else if (await res.locals.store.existsCourseTitle(courseTitle)) {
      req.flash("error", "The course title must be unique.");
      rerenderNewCourse();
    } else {
      let created = await res.locals.store.createCourse(courseTitle);
      if (!created) {
        next(new Error("Failed to create course."));
      } else {
        req.flash("success", "The course has been created.");
        res.redirect("/courses");
      }
    }
  })
);

// Render individual course and its todos
app.get(
  "/courses/:courseId",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let courseId = req.params.courseId;
    let course = await res.locals.store.loadCourse(+courseId);

    if (course === undefined) {
      next(new Error("Not found."));
    } else {
      course.todos = await res.locals.store.sortedTodos(course);

      res.render("course", {
        course,
        isDonecourse: res.locals.store.isDoneCourse(course),
        hasUndoneTodos: res.locals.store.hasUndoneTodos(course),
      });
    }
  })
);

// Toggle completion status of a todo
app.post(
  "/courses/:courseId/todos/:todoId/toggle",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let { courseId, todoId } = req.params;
    let toggled = await res.locals.store.toggleDoneTodo(+courseId, +todoId);
    if (!toggled) {
      next(new Error("Not found."));
    } else {
      let todo = await res.locals.store.loadTodo(+courseId, +todoId);
      if (todo.done) {
        req.flash("success", `"${todo.title}" marked done.`);
      } else {
        req.flash("success", `"${todo.title}" marked as NOT done!`);
      }

      res.redirect(`/courses/${courseId}`);
    }
  })
);

// Delete a todo
app.post(
  "/courses/:courseId/todos/:todoId/destroy",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let { courseId, todoId } = req.params;

    let deleted = await res.locals.store.deleteTodo(+courseId, +todoId);
    if (!deleted) {
      next(new Error("Not found."));
    } else {
      req.flash("success", "The todo has been deleted.");
      res.redirect(`/courses/${courseId}`);
    }
  })
);

// Mark all todos as done
app.post(
  "/courses/:courseId/complete_all",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let courseId = req.params.courseId;
    if (await !res.locals.store.completeAllTodos(+courseId)) {
      next(new Error("Not found."));
    } else {
      req.flash("success", "All todos have been marked as done.");
      res.redirect(`/courses/${courseId}`);
    }
  })
);

// Create a new todo and add it to the specified course
app.post(
  "/courses/:courseId/todos",
  requiresAuthentication,
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The todo title is required.")
      .isLength({ max: 100 })
      .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let courseId = req.params.courseId;
    let course = await res.locals.store.loadcourse(+courseId);
    let todoTitle = req.body.todoTitle;

    if (!course) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach((message) => req.flash("error", message.msg));

        course.todos = await res.locals.store.sortedTodos(course);

        res.render("course", {
          course,
          todoTitle,
          isDonecourse: res.locals.store.isDonecourse(course),
          hasUndoneTodos: res.locals.store.hasUndoneTodos(course),
          flash: req.flash(),
        });
      } else {
        let created = await res.locals.store.createTodo(+courseId, todoTitle);
        if (!created) {
          next(new Error("Not found."));
        } else {
          req.flash("success", "The todo has been created.");
          res.redirect(`/courses/${courseId}`);
        }
      }
    }
  })
);

// Render edit todo course form
app.get(
  "/courses/:courseId/edit",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let courseId = req.params.courseId;
    let course = await res.locals.store.loadcourse(+courseId);
    if (!course) {
      next(new Error("Not found."));
    } else {
      res.render("edit-course", { course });
    }
  })
);

// Delete todo course
app.post(
  "/courses/:courseId/destroy",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let courseId = +req.params.courseId;
    let deleted = await res.locals.store.deletecourse(+courseId);
    if (!deleted) {
      next(new Error("Not found."));
    } else {
      req.flash("success", "Todo course deleted.");
      res.redirect("/courses");
    }
  })
);

// Edit todo course title
app.post(
  "/courses/:courseId/edit",
  requiresAuthentication,
  [
    body("courseTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The course title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let store = res.locals.store;
    let courseId = req.params.courseId;
    let courseTitle = req.body.courseTitle;

    const rerenderEditList = async () => {
      let course = await store.loadcourse(+courseId);
      if (!course) {
        next(new Error("Not found."));
      } else {
        res.render("edit-course", {
          courseTitle,
          course,
          flash: req.flash(),
        });
      }
    };

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((message) => req.flash("error", message.msg));
      await rerenderEditList();
    } else if (await res.locals.store.existsCourseTitle(courseTitle)) {
      req.flash("error", "The course title must be unique.");
      await rerenderEditList();
    } else if (await !res.locals.store.setcourseTitle(+courseId, courseTitle)) {
      next(new Error("Not found."));
    } else {
      req.flash("success", "Todo course updated.");
      res.redirect(`/courses/${courseId}`);
    }
  })
);

app.get(
  "/signin",
  catchError(async (req, res) => {
    req.flash("info", "Please sign in.");
    res.render("signin", {
      flash: req.flash(),
    });
  })
);

app.get(
  "/signup",
  catchError(async (req, res) => {
    req.flash("info", "Please sign in.");
    res.render("signup", {
      flash: req.flash(),
    });
  })
);

app.post(
  "/signup",
  [
    body("username")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The username is required."),
    body("password")
      .isLength({ min: 1 })
      .withMessage("The password is required."),
  ],
  catchError(async (req, res, next) => {
    let errors = validationResult(req);
    let username = req.body.username.trim();
    let password = req.body.password;

    console.log("username", username);
    console.log("password", password);

    const rerenderNewCourse = () => {
      res.render("signup", {
        username,
        flash: req.flash(),
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach((message) => req.flash("error", message.msg));
      rerenderNewCourse();
    } else if (await res.locals.store.existsUser({ username, password })) {
      req.flash("error", "Invalid credentials.");
      rerenderNewCourse();
    } else {
      let created = await res.locals.store.createUser({ username, password });
      if (!created) {
        next(new Error("Failed to create new user."));
      } else {
        req.session.username = username;
        req.session.signedIn = true;
        req.flash("info", "Welcome!");
        res.redirect("/courses");
      }
    }
  })
);

app.post(
  "/signin",
  [
    body("username")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The username is required."),
    body("password")
      .isLength({ min: 1 })
      .withMessage("The password is required."),
  ],
  catchError(async (req, res, next) => {
    let errors = validationResult(req);
    let username = req.body.username.trim();
    let password = req.body.password;

    const rerenderNewCourse = () => {
      res.render("signin", {
        username,
        flash: req.flash(),
      });
    };

    const authenticated = await res.locals.store.authenticate({
      username,
      password,
      session,
    });

    if (!errors.isEmpty()) {
      errors.array().forEach((message) => req.flash("error", message.msg));
      rerenderNewCourse();
    } else if (!authenticated) {
      req.flash("error", "Invalid credentials.");
      rerenderNewCourse();
    } else {
      req.session.signedIn = true;
      req.flash("info", "Welcome!");
      res.redirect("/courses");
    }
  })
);

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`App is listening on port ${port} of ${host}!`);
});
