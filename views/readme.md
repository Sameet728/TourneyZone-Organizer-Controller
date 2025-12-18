.msger-inputarea {
  display: flex;
  padding: 10px;
  border-top: var(--border);
  background: #eee;
}
.msger-inputarea * {
  padding: 10px;
  border: none;
  border-radius: 3px;
  font-size: 1em;
}
.msger-input {
  flex: 1;
  background: #ddd;
}
.msger-send-btn {
  /* margin-left: 10px;
  background: rgb(0, 196, 65);
  color: #fff;
  font-weight: bold;
  cursor: pointer; */
  /* transition: background 0.23s; */
}
.msger-send-btn:hover {
  background: rgb(0, 180, 50);
}



<!-- login and signup btn form dta  -->
<%if(!currentUser){%>
              <a class="nav-link nav-a btn-signup" aria-current="page" href="/signup">Signup</a><br>
              <a class="nav-link nav-a btn-login" href="/login">Login</a>
            <%}%>
            <%if(currentUser){%>
              <div class="dropdown user-profile">
                <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                  <i class="fa-regular fa-user" style="color: #ffffff;"></i>
                </button>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item" href="/profile">Profile</a></li>
                  <li><a class="dropdown-item" href="#">Another action</a></li>
                  <li><a class="dropdown-item" href="/logout">Logout</a></li>
                </ul>
              </div>
              <div class="profile">
                <a href="/profile" class="nav-link nav-a profile" style="display: none;">Profile</a>
              </div><br>
            <a class="nav-link nav-a btn-logout  " href="/logout">Logout  <i class="fa-solid fa-arrow-right-from-bracket" style="color: #ffffff;"></i></a>
            <%}%>