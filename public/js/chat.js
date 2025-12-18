let btn = document.querySelector('.btn');
let i =document.querySelector('.spinner')
btn.addEventListener('click', function(event) {
 i.textContent ="";
 i.style.color = 'white';
 i.classList.add('fa-solid', 'fa-spinner', 'fa-spin');
 
console.log('Element clicked');

});
let scroll= function() {
    const chat = document.getElementById('msger-chat');
    chat.scrollTop = chat.scrollHeight;
};
scroll();

let cancel=document.querySelector('.cancel');
let clearall =document.querySelector('.clearall');
let clearhistory =document.querySelector('.clearhis');
 
cancel.addEventListener('click',function(event){
    clearhistory.style.visibility="hidden";
});
clearall.addEventListener('click',function(event){
    clearhistory.style.visibility="visible";
});