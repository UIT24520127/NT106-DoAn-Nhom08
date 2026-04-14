using System.Threading.Tasks;
namespace ServerUndercover.Controllers
{
    public interface IUserService
    {
        Task<object> GetUserProfile(string userId);
    }
}
